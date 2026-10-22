import { assert, describe, layer } from '@effect/vitest'
import {
  Array as Arr,
  Clock,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  Queue,
  Record,
  Ref,
  Schema,
  SchemaGetter,
} from 'effect'

import {
  buildDeadLetterName,
  buildResourceName,
  provision,
  type Resources,
} from '@app-template/aws'
import { AwsClientsMiniStack, buildStage, recordLogs } from '@app-template/testing'

import { type AttemptInfo, QueueClient, type QueueDefinition, worker } from '#queue/queue'
import { QueueError, QueueTransport } from '#queue/queue.transport'

class Ping extends Schema.Class<Ping>('Ping')({ id: Schema.String, text: Schema.String }) {}

const stage = buildStage()

const maxAttempts = 3

const inventory = {
  buckets: {},
  queues: {
    consumed: { name: 'consumed', maxReceiveCount: maxAttempts },
    exhausted: { name: 'exhausted', maxReceiveCount: maxAttempts },
    heartbeat: { name: 'heartbeat', maxReceiveCount: maxAttempts },
    released: { name: 'released', maxReceiveCount: maxAttempts },
    interrupted: { name: 'interrupted', maxReceiveCount: maxAttempts },
    recovered: { name: 'recovered', maxReceiveCount: maxAttempts },
    malformed: { name: 'malformed', maxReceiveCount: maxAttempts },
    decoding: { name: 'decoding', maxReceiveCount: maxAttempts },
    settling: { name: 'settling', maxReceiveCount: maxAttempts },
  },
} as const satisfies Resources

// SQS counts visibility in whole seconds, so one second is the shortest retry delay.
const definitions = Record.map(
  inventory.queues,
  ({ name }) =>
    ({
      name,
      schema: Ping,
      maxAttempts,
      retryDelay: () => '1 second',
      jobId: (ping) => ping.id,
    }) satisfies QueueDefinition<typeof Ping>,
)

type PingQueue = QueueDefinition<Schema.Codec<Ping, typeof Ping.Encoded>>

const stallDecode = (decoding: Deferred.Deferred<void>) =>
  Ping.pipe(
    Schema.decode({
      decode: SchemaGetter.checkEffect(() =>
        Deferred.succeed(decoding, undefined).pipe(Effect.andThen(Effect.never)),
      ),
      encode: SchemaGetter.passthrough(),
    }),
  )

const queueName = (name: string) => buildResourceName(stage, name)

const lockExpiration = Duration.seconds(2)

// Retries after 2 s, then 4 s: the second outlasts the visibility timeout, so only the delay
// for that attempt can space it.
const exhausted = {
  ...definitions.exhausted,
  retryDelay: (attempt: number) => Duration.times(lockExpiration, attempt),
}

// Longer than the visibility timeout, so only the settle's retry delay can space two attempts.
const retryDelay = Duration.seconds(4)

const settling = { ...definitions.settling, retryDelay: () => retryDelay }

const clientOptions = { queueName, lockExpiration, lockRefreshInterval: '500 millis' } as const

const QueueClientMiniStack = QueueClient.layer(clientOptions).pipe(
  Layer.provideMerge(QueueTransport.layerSqs),
  Layer.provide(Layer.effectDiscard(provision(inventory, stage))),
  Layer.provide(AwsClientsMiniStack),
)

const wrapTransport = (
  wrap: (transport: QueueTransport['Service']) => Effect.Effect<QueueTransport['Service']>,
) =>
  QueueClient.layer(clientOptions).pipe(
    Layer.provide(Layer.effect(QueueTransport, QueueTransport.use(wrap))),
  )

// Over the suite's SQS transport; only the first `receive` fails.
const QueueClientFailingOnce = wrapTransport((transport) =>
  Effect.gen(function* () {
    const hasFailed = yield* Ref.make(false)
    return QueueTransport.of({
      ...transport,
      receive: (queue, options) =>
        Ref.getAndSet(hasFailed, true).pipe(
          Effect.flatMap((alreadyFailed) =>
            alreadyFailed
              ? transport.receive(queue, options)
              : Effect.fail(new QueueError({ cause: 'receive refused' })),
          ),
        ),
    })
  }),
)

// Over the suite's SQS transport; the first `extend` completes `extending`, then waits a second.
const slowFirstExtend = () => {
  const extending = Deferred.makeUnsafe<void>()
  const layer = wrapTransport((transport) =>
    Effect.succeed(
      QueueTransport.of({
        ...transport,
        extend: (queue, handle, visibility) =>
          Deferred.succeed(extending, undefined).pipe(
            Effect.flatMap((isFirst) => (isFirst ? Effect.sleep('1 second') : Effect.void)),
            Effect.andThen(transport.extend(queue, handle, visibility)),
          ),
      }),
    ),
  )
  return { extending, layer }
}

const malformedBody = '{"id":"no text"}'

// Each case waits on SQS in real time: retry delays and visibility timeouts of whole seconds.
const realTime = 30_000

type Seen = readonly [text: string, attempt: AttemptInfo]

const recordAttempts = (seen: Queue.Queue<Seen>) => (ping: Ping, attempt: AttemptInfo) =>
  Queue.offer(seen, [ping.text, attempt])

type TimedSeen = readonly [seen: Seen, at: number]

/** Records each attempt with its time, then fails it when the text is `fail`. */
const recordTimedAttempts = (seen: Queue.Queue<TimedSeen>) => (ping: Ping, attempt: AttemptInfo) =>
  Clock.currentTimeMillis.pipe(
    Effect.flatMap((at) => Queue.offer(seen, [[ping.text, attempt], at])),
    Effect.andThen(ping.text === 'fail' ? Effect.fail('handler failed') : Effect.void),
  )

const sendPing = (definition: PingQueue, text: string) =>
  QueueClient.use((client) => client.send(definition, new Ping({ id: text, text })))

const buildAttemptInfo = (attempt: number): AttemptInfo => ({
  attempt,
  maxAttempts,
  isLastAttempt: attempt >= maxAttempts,
})

const receiveDeadLettered = (definition: PingQueue) =>
  QueueTransport.use((transport) =>
    transport.receive(buildDeadLetterName(queueName(definition.name)), {
      visibility: '30 seconds',
      wait: '10 seconds',
    }),
  ).pipe(Effect.flatMap(Effect.fromOption))

describe('QueueClient.send and worker over QueueTransport.layerSqs against MiniStack', () => {
  layer(QueueClientMiniStack, { timeout: '60 seconds', excludeTestServices: true })((it) => {
    it.effect('consumes a sent message as its first attempt', () =>
      Effect.gen(function* () {
        const seen = yield* Queue.unbounded<Seen>()
        yield* Layer.build(worker(definitions.consumed, recordAttempts(seen)))

        yield* sendPing(definitions.consumed, 'hello')

        assert.deepStrictEqual(yield* Queue.take(seen), ['hello', buildAttemptInfo(1)])
      }),
    )

    it.effect(
      'counts every failed attempt, waits each retry delay, dead-letters the last and keeps consuming',
      () => {
        const { logs, layer: recordedLogs } = recordLogs('queue')
        return Effect.gen(function* () {
          const seen = yield* Queue.unbounded<TimedSeen>()
          yield* Layer.build(worker(exhausted, recordTimedAttempts(seen)))

          yield* sendPing(exhausted, 'fail')
          const attempts = yield* Queue.takeN(seen, maxAttempts)
          const deadLettered = yield* receiveDeadLettered(exhausted)
          yield* sendPing(exhausted, 'after')
          const [after] = yield* Queue.take(seen)

          assert.deepStrictEqual(
            Arr.map(attempts, ([attempt]) => attempt),
            [
              ['fail', buildAttemptInfo(1)],
              ['fail', buildAttemptInfo(2)],
              ['fail', buildAttemptInfo(3)],
            ],
          )
          const times = Arr.map(attempts, ([, at]) => at)
          assert.isAtLeast((times[1] ?? 0) - (times[0] ?? 0), 2000)
          assert.isAtLeast((times[2] ?? 0) - (times[1] ?? 0), 4000)
          assert.deepStrictEqual(JSON.parse(deadLettered.body), { id: 'fail', text: 'fail' })
          assert.deepStrictEqual(after, ['after', buildAttemptInfo(1)])
          assert.deepStrictEqual(logs, [
            ['Warn', 'queue message attempt failed', 'exhausted'],
            ['Warn', 'queue message attempt failed', 'exhausted'],
            ['Error', 'queue message dead-lettered', 'exhausted'],
          ])
        }).pipe(Effect.provide(recordedLogs))
      },
      realTime,
    )

    it.effect(
      'keeps a job from a second worker while its handler runs past the visibility timeout',
      () =>
        Effect.gen(function* () {
          const seen = yield* Queue.unbounded<Seen>()
          const slow = worker(definitions.heartbeat, (ping, attempt) =>
            recordAttempts(seen)(ping, attempt).pipe(
              Effect.andThen(Effect.sleep(Duration.sum(lockExpiration, Duration.seconds(1)))),
            ),
          )
          yield* Layer.build(slow)
          yield* Layer.build(slow)

          yield* sendPing(definitions.heartbeat, 'slow')
          const first = yield* Queue.take(seen)
          yield* Effect.sleep(Duration.sum(lockExpiration, Duration.seconds(2)))

          assert.deepStrictEqual(first, ['slow', buildAttemptInfo(1)])
          assert.deepStrictEqual(yield* Queue.poll(seen), Option.none())
        }),
      realTime,
    )

    it.effect(
      "closing a worker's scope returns its job at once as the next attempt, unlogged",
      () => {
        const { logs, layer: recordedLogs } = recordLogs('queue')
        return Effect.gen(function* () {
          const seen = yield* Queue.unbounded<Seen>()
          const hang = worker(definitions.released, (ping, attempt) =>
            recordAttempts(seen)(ping, attempt).pipe(Effect.andThen(Effect.never)),
          )

          yield* sendPing(definitions.released, 'slow')
          const interrupted = yield* Layer.build(hang).pipe(
            Effect.andThen(Queue.take(seen)),
            Effect.scoped,
          )
          yield* Layer.build(hang)
          const [elapsed, next] = yield* Effect.timed(Queue.take(seen))

          assert.deepStrictEqual(
            [interrupted, next],
            [
              ['slow', buildAttemptInfo(1)],
              ['slow', buildAttemptInfo(2)],
            ],
          )
          assert.isBelow(Duration.toMillis(elapsed), Duration.toMillis(lockExpiration) / 2)
          assert.deepStrictEqual(logs, [])
        }).pipe(Effect.provide(recordedLogs))
      },
      realTime,
    )

    it.effect(
      'returns a job whose handler interrupts itself as the next attempt, unlogged',
      () => {
        const { logs, layer: recordedLogs } = recordLogs('queue')
        return Effect.gen(function* () {
          const seen = yield* Queue.unbounded<Seen>()
          const calls = yield* Ref.make(0)
          yield* Layer.build(
            worker(definitions.interrupted, (ping, attempt) =>
              recordAttempts(seen)(ping, attempt).pipe(
                Effect.andThen(Ref.getAndUpdate(calls, (n) => n + 1)),
                Effect.andThen((n) => (n === 0 ? Effect.interrupt : Effect.void)),
              ),
            ),
          )

          yield* sendPing(definitions.interrupted, 'gives up')

          assert.deepStrictEqual(yield* Queue.takeN(seen, 2), [
            ['gives up', buildAttemptInfo(1)],
            ['gives up', buildAttemptInfo(2)],
          ])
          assert.deepStrictEqual(logs, [])
        }).pipe(Effect.provide(recordedLogs))
      },
      realTime,
    )

    it.effect(
      'keeps consuming after the transport fails a receive, logging the failure',
      () => {
        const { logs, layer: recordedLogs } = recordLogs('queue')
        return Effect.gen(function* () {
          const seen = yield* Queue.unbounded<Seen>()
          yield* Layer.build(
            worker(definitions.recovered, recordAttempts(seen)).pipe(
              Layer.provide(QueueClientFailingOnce),
            ),
          )

          yield* sendPing(definitions.recovered, 'after failure')

          assert.deepStrictEqual(yield* Queue.take(seen), ['after failure', buildAttemptInfo(1)])
          assert.deepStrictEqual(logs, [['Error', 'queue consumer failed', 'recovered']])
        }).pipe(Effect.provide(recordedLogs))
      },
      realTime,
    )

    it.effect(
      'dead-letters a body that does not decode without calling the handler',
      () => {
        const { logs, layer: recordedLogs } = recordLogs('queue')
        return Effect.gen(function* () {
          const seen = yield* Queue.unbounded<Seen>()
          yield* Layer.build(worker(definitions.malformed, recordAttempts(seen)))

          yield* QueueTransport.use((transport) =>
            transport.send(queueName(definitions.malformed.name), malformedBody, {
              jobId: 'malformed',
            }),
          )
          const deadLettered = yield* receiveDeadLettered(definitions.malformed)

          assert.strictEqual(deadLettered.body, malformedBody)
          assert.deepStrictEqual(yield* Queue.poll(seen), Option.none())
          assert.deepStrictEqual(
            logs,
            Arr.replicate(['Error', 'queue message does not decode', 'malformed'], maxAttempts),
          )
        }).pipe(Effect.provide(recordedLogs))
      },
      realTime,
    )

    it.effect(
      'returns a job at once as the next attempt when its worker stops while the body decodes',
      () =>
        Effect.gen(function* () {
          const seen = yield* Queue.unbounded<Seen>()
          const decoding = yield* Deferred.make<void>()
          const stalling = { ...definitions.decoding, schema: stallDecode(decoding) }

          yield* sendPing(definitions.decoding, 'stalls')
          yield* Layer.build(worker(stalling, recordAttempts(seen))).pipe(
            Effect.andThen(Deferred.await(decoding)),
            Effect.scoped,
          )
          yield* Layer.build(worker(definitions.decoding, recordAttempts(seen)))
          const [elapsed, next] = yield* Effect.timed(Queue.take(seen))

          assert.deepStrictEqual(next, ['stalls', buildAttemptInfo(2)])
          assert.isBelow(Duration.toMillis(elapsed), Duration.toMillis(lockExpiration) / 2)
        }),
      realTime,
    )

    it.effect(
      'keeps the retry delay when its worker stops while a failed attempt settles',
      () =>
        Effect.gen(function* () {
          const seen = yield* Queue.unbounded<TimedSeen>()
          const { extending, layer: slowExtend } = slowFirstExtend()

          yield* sendPing(settling, 'fail')
          yield* Layer.build(
            worker(settling, recordTimedAttempts(seen)).pipe(Layer.provide(slowExtend)),
          ).pipe(Effect.andThen(Deferred.await(extending)), Effect.scoped)
          yield* Layer.build(worker(settling, recordTimedAttempts(seen)))
          const attempts = yield* Queue.takeN(seen, 2)

          assert.deepStrictEqual(
            Arr.map(attempts, ([attempt]) => attempt),
            [
              ['fail', buildAttemptInfo(1)],
              ['fail', buildAttemptInfo(2)],
            ],
          )
          const [failedAt = 0, retriedAt = 0] = Arr.map(attempts, ([, at]) => at)
          assert.isAtLeast(retriedAt - failedAt, Duration.toMillis(retryDelay))
        }),
      realTime,
    )
  })
})
