import { assert, describe, it } from '@effect/vitest'
import {
  Array as Arr,
  Clock,
  ConfigProvider,
  Effect,
  Layer,
  Option,
  Order,
  Queue,
  Ref,
} from 'effect'

import { buildResourceName } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
import { ChatId, MessageId } from '@app-template/domain/chat'
import { QueueClient, QueueError, QueueTransport } from '@app-template/queue'
import { recordLogs } from '@app-template/testing'

import { assistantMessageQueue, GenerateAssistantMessage } from '#infrastructure/chat/chat.queue'
import { Db } from '#infrastructure/db/db.client'
import { DbTest } from '#infrastructure/db/testing/db.test-layer'
import { outbox } from '#infrastructure/outbox/outbox.entity'
import { OutboxRelay } from '#infrastructure/outbox/outbox.relay'
import { QueueClientOutbox } from '#infrastructure/shared/queue.client'
import { AwsTest } from '#infrastructure/testing/aws.test-layer'

interface Attempt {
  readonly queue: string
  readonly jobId: string
  readonly body: string
}

const recordTransport = Effect.gen(function* () {
  const attempts = yield* Queue.unbounded<Attempt>()
  const refusing = yield* Ref.make(false)
  const layer = Layer.succeed(
    QueueTransport,
    QueueTransport.of({
      send: Effect.fnUntraced(function* (queue, { body, attributes }) {
        const refused = yield* Ref.get(refusing)

        yield* Queue.offer(attempts, { queue, jobId: attributes.jobId, body })
        if (refused) return yield* new QueueError({ cause: 'refused' })
      }),
      receive: () => Effect.die('the relay only sends'),
      extend: () => Effect.die('the relay only sends'),
      delete: () => Effect.die('the relay only sends'),
    }),
  )
  return { attempts, refusing, layer }
})

const pollInterval = 300

const PollInterval = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ OUTBOX_POLL_INTERVAL: `${pollInterval} millis` }),
)

const OutboxDbTest = QueueClientOutbox.pipe(Layer.provideMerge(DbTest), Layer.merge(PollInterval))

// The recording transport sees the queue name, so the stage is fixed.
const OutboxTest = OutboxDbTest.pipe(
  Layer.merge(
    Layer.succeed(AwsConfig, { region: 'us-east-1', endpoint: Option.none(), stage: 'test' }),
  ),
)

// The test's own stage on the run's MiniStack: the relay sends to its real queue.
const OutboxSqsTest = QueueTransport.layerSqs.pipe(
  Layer.provideMerge(AwsTest),
  Layer.merge(OutboxDbTest),
)

const jobId = (n: number) => `0192d4e0-7b3a-7c00-8000-${String(n).padStart(12, '0')}`

const enqueue = (n: number) =>
  Effect.flatMap(QueueClient, (queue) =>
    queue.send(
      assistantMessageQueue,
      new GenerateAssistantMessage({
        chatId: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000030'),
        messageId: MessageId.make(jobId(n)),
      }),
    ),
  )

// `for update` waits for every relay transaction that holds a row, so it reads the outbox as the
// relays left it.
const lockOutbox = Effect.flatMap(Db, (db) =>
  db.select({ jobId: outbox.jobId }).from(outbox).for('update'),
)

describe('OutboxRelay', () => {
  it.effect('sends a pending row to its queue with its job id and JSON body, then deletes it', () =>
    Effect.gen(function* () {
      const { attempts, layer } = yield* recordTransport
      yield* enqueue(1)

      yield* Layer.build(OutboxRelay.pipe(Layer.provide(layer)))
      const attempt = yield* Queue.take(attempts)

      assert.strictEqual(attempt.queue, 'app-template-test-assistant-message')
      assert.strictEqual(attempt.jobId, '0192d4e0-7b3a-7c00-8000-000000000001')
      assert.deepStrictEqual(JSON.parse(attempt.body), {
        chatId: '0192d4e0-7b3a-7c00-8000-000000000030',
        messageId: '0192d4e0-7b3a-7c00-8000-000000000001',
      })
      assert.deepStrictEqual(yield* lockOutbox, [])
    }).pipe(Effect.provide(OutboxTest)),
  )

  // Live: SQS long-polls in real time.
  it.live(
    "a pending row reaches the stage's real queue with its job id and JSON body, then is deleted",
    () =>
      Effect.gen(function* () {
        const { stage } = yield* AwsConfig
        yield* enqueue(1)

        yield* Layer.build(OutboxRelay)
        const received = yield* QueueTransport.use((transport) =>
          transport.receive(buildResourceName(stage, assistantMessageQueue.name), {
            visibility: '30 seconds',
            wait: '10 seconds',
          }),
        ).pipe(Effect.flatMap(Effect.fromOption))

        assert.strictEqual(received.attributes.jobId, jobId(1))
        assert.deepStrictEqual(JSON.parse(received.body), {
          chatId: '0192d4e0-7b3a-7c00-8000-000000000030',
          messageId: jobId(1),
        })
        assert.deepStrictEqual(yield* lockOutbox, [])
      }).pipe(Effect.provide(OutboxSqsTest)),
    30_000,
  )

  // The clock stands still, so a relay that slept after a full batch would leave rows unsent.
  it.effect('two relays over one database send 25 rows, more than a batch, once each', () =>
    Effect.gen(function* () {
      const { attempts, layer } = yield* recordTransport
      const ns = Arr.range(1, 25)
      yield* Effect.forEach(ns, enqueue, { discard: true })

      yield* Layer.build(OutboxRelay.pipe(Layer.provide(layer)))
      yield* Layer.build(OutboxRelay.pipe(Layer.provide(layer)))
      const sent = yield* Queue.takeN(attempts, 25)
      const left = yield* lockOutbox

      assert.deepStrictEqual(
        Arr.sort(
          Arr.map(sent, (attempt) => attempt.jobId),
          Order.String,
        ),
        Arr.map(ns, jobId),
      )
      assert.deepStrictEqual(left, [])
      assert.deepStrictEqual(yield* Queue.poll(attempts), Option.none())
    }).pipe(Effect.provide(OutboxTest)),
  )

  // Live, as is the next test: a `TestClock` cannot tell when the relay has reached its sleep.
  it.live('keeps the rows while the transport refuses and sends them on the next poll', () => {
    const { logs, layer: recordedLogs } = recordLogs()
    return Effect.gen(function* () {
      const { attempts, refusing, layer } = yield* recordTransport
      yield* Ref.set(refusing, true)
      yield* enqueue(1)

      yield* Layer.build(OutboxRelay.pipe(Layer.provide(layer)))
      yield* Queue.take(attempts)
      const refusedAt = yield* Clock.currentTimeMillis
      yield* Ref.set(refusing, false)
      const kept = yield* lockOutbox
      const sent = yield* Queue.take(attempts)
      const sentAt = yield* Clock.currentTimeMillis

      assert.deepStrictEqual(kept, [{ jobId: jobId(1) }])
      assert.strictEqual(sent.jobId, jobId(1))
      assert.isAtLeast(sentAt - refusedAt, pollInterval)
      assert.deepStrictEqual(yield* lockOutbox, [])
      assert.deepStrictEqual(logs, [['Error', 'outbox relay failed']])
    }).pipe(Effect.provide([OutboxTest, recordedLogs]))
  })

  it.live('waits OUTBOX_POLL_INTERVAL after a batch shorter than its limit', () =>
    Effect.gen(function* () {
      const { attempts, layer } = yield* recordTransport
      yield* enqueue(1)

      yield* Layer.build(OutboxRelay.pipe(Layer.provide(layer)))
      yield* Queue.take(attempts)
      const firstAt = yield* Clock.currentTimeMillis
      yield* lockOutbox
      yield* enqueue(2)
      yield* Queue.take(attempts)
      const secondAt = yield* Clock.currentTimeMillis

      assert.isAtLeast(secondAt - firstAt, pollInterval)
    }).pipe(Effect.provide(OutboxTest)),
  )
})
