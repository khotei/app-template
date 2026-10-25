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

import { ChatId, MessageId } from '@app-template/domain/chat'
import { QueueClient, QueueError, QueueTransport } from '@app-template/queue'
import { recordLogs } from '@app-template/testing'

import { assistantMessageQueue, GenerateAssistantMessage } from '#infrastructure/chat/chat.queue'
import { Db } from '#infrastructure/db/db.client'
import { outbox } from '#infrastructure/outbox/outbox.entity'
import { OutboxRelay } from '#infrastructure/outbox/outbox.relay'
import { QueueClientOutbox } from '#infrastructure/shared/queue.client'
import { DbTest } from '#infrastructure/testing/db-test'

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

const OutboxTest = QueueClientOutbox.pipe(
  Layer.provideMerge(DbTest),
  Layer.merge(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        AWS_REGION: 'us-east-1',
        STAGE: 'test',
        OUTBOX_POLL_INTERVAL: `${pollInterval} millis`,
      }),
    ),
  ),
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
  it.effect('sends a pending row to its queue with its job id, then deletes it', () =>
    Effect.gen(function* () {
      const { attempts, layer } = yield* recordTransport
      yield* enqueue(1)

      yield* Layer.build(OutboxRelay.pipe(Layer.provide(layer)))
      const attempt = yield* Queue.take(attempts)

      assert.deepStrictEqual(attempt, {
        queue: 'app-template-test-assistant-message',
        jobId: '0192d4e0-7b3a-7c00-8000-000000000001',
        body: '{"chatId":"0192d4e0-7b3a-7c00-8000-000000000030","messageId":"0192d4e0-7b3a-7c00-8000-000000000001"}',
      })
      assert.deepStrictEqual(yield* lockOutbox, [])
    }).pipe(Effect.provide(OutboxTest)),
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
      yield* Ref.set(refusing, false)
      const kept = yield* lockOutbox
      const sent = yield* Queue.take(attempts)

      assert.deepStrictEqual(kept, [{ jobId: jobId(1) }])
      assert.strictEqual(sent.jobId, jobId(1))
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
