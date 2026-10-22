import { assert, describe, layer } from '@effect/vitest'
import {
  Array as Arr,
  Clock,
  Duration,
  Effect,
  Layer,
  Option,
  Queue,
  Record,
  Ref,
  Schedule,
  Schema,
} from 'effect'

import {
  buildDeadLetterName,
  buildResourceName,
  provision,
  type Resources,
} from '@app-template/aws'
import { AwsClientsMiniStack, buildStage, recordLogs } from '@app-template/testing'

import { type AttemptInfo, QueueClient, type QueueDefinition, worker } from '#queue/queue'
import { QueueTransport } from '#queue/queue.transport'

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
      retrySchedule: Schedule.spaced('1 second'),
      jobId: (ping) => ping.id,
    }) satisfies QueueDefinition<typeof Ping>,
)

type PingQueue = (typeof definitions)[keyof typeof definitions]

const queueName = (name: string) => buildResourceName(stage, name)

const lockExpiration = Duration.seconds(2)

const QueueClientMiniStack = QueueClient.layer({
  queueName,
  lockExpiration,
  lockRefreshInterval: '500 millis',
}).pipe(
  Layer.provideMerge(QueueTransport.layerSqs),
  Layer.provide(Layer.effectDiscard(provision(inventory, stage))),
  Layer.provide(AwsClientsMiniStack),
)

// Each case waits on SQS in real time: retry delays and visibility timeouts of whole seconds.
const realTime = 30_000

type Seen = readonly [text: string, attempt: AttemptInfo]

const recordAttempts = (seen: Queue.Queue<Seen>) => (ping: Ping, attempt: AttemptInfo) =>
  Queue.offer(seen, [ping.text, attempt])

const sendPing = (definition: PingQueue, text: string) =>
  QueueClient.use((client) => client.send(definition, new Ping({ id: text, text })))

const attemptOf = (attempt: number): AttemptInfo => ({
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

describe('QueueClient.send and worker on QueueClient.layerSqs against MiniStack', () => {
  layer(QueueClientMiniStack, { timeout: '60 seconds', excludeTestServices: true })((it) => {
    it.effect('consumes a sent message as its first attempt', () =>
      Effect.gen(function* () {
        const seen = yield* Queue.unbounded<Seen>()
        yield* Layer.build(worker(definitions.consumed, recordAttempts(seen)))

        yield* sendPing(definitions.consumed, 'hello')

        assert.deepStrictEqual(yield* Queue.take(seen), ['hello', attemptOf(1)])
      }),
    )

    it.effect(
      'counts every failed attempt, waits each retry delay, dead-letters the last and keeps consuming',
      () => {
        const { logs, layer: recordedLogs } = recordLogs('queue')
        return Effect.gen(function* () {
          const seen = yield* Queue.unbounded<readonly [Seen, number]>()
          yield* Layer.build(
            worker(definitions.exhausted, (ping, attempt) =>
              Clock.currentTimeMillis.pipe(
                Effect.flatMap((at) => Queue.offer(seen, [[ping.text, attempt], at])),
                Effect.andThen(ping.text === 'fail' ? Effect.fail('handler failed') : Effect.void),
              ),
            ),
          )

          yield* sendPing(definitions.exhausted, 'fail')
          const attempts = yield* Queue.takeN(seen, maxAttempts)
          const deadLettered = yield* receiveDeadLettered(definitions.exhausted)
          yield* sendPing(definitions.exhausted, 'after')
          const [after] = yield* Queue.take(seen)

          assert.deepStrictEqual(
            Arr.map(attempts, ([attempt]) => attempt),
            [
              ['fail', attemptOf(1)],
              ['fail', attemptOf(2)],
              ['fail', attemptOf(3)],
            ],
          )
          const times = Arr.map(attempts, ([, at]) => at)
          assert.isAtLeast((times[1] ?? 0) - (times[0] ?? 0), 1000)
          assert.isAtLeast((times[2] ?? 0) - (times[1] ?? 0), 1000)
          assert.deepStrictEqual(JSON.parse(deadLettered.body), { id: 'fail', text: 'fail' })
          assert.deepStrictEqual(after, ['after', attemptOf(1)])
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

          assert.deepStrictEqual(first, ['slow', attemptOf(1)])
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
              ['slow', attemptOf(1)],
              ['slow', attemptOf(2)],
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
            ['gives up', attemptOf(1)],
            ['gives up', attemptOf(2)],
          ])
          assert.deepStrictEqual(logs, [])
        }).pipe(Effect.provide(recordedLogs))
      },
      realTime,
    )
  })
})
