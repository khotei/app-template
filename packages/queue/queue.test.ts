import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assert, describe, it } from '@effect/vitest'
import {
  Effect,
  Exit,
  Layer,
  Logger,
  Option,
  Queue,
  Ref,
  References,
  Schedule,
  Schema,
  type Scope,
} from 'effect'
import { PersistedQueue } from 'effect/persistence'
import { TestClock } from 'effect/testing'

import { type AttemptInfo, QueueClient, type QueueDefinition, send, worker } from '#queue/queue'

class Ping extends Schema.Class<Ping>('Ping')({ id: Schema.String, text: Schema.String }) {}

const pings = {
  name: 'pings',
  schema: Ping,
  maxAttempts: 1,
  retrySchedule: Schedule.spaced('1 second'),
  jobId: (ping) => ping.id,
} satisfies QueueDefinition<typeof Ping>

const receive = (count: number) =>
  Effect.gen(function* () {
    const received = yield* Queue.unbounded<string>()
    yield* Layer.build(
      worker(pings, (ping) =>
        ping.text === 'fail' ? Effect.fail('handler failed') : Queue.offer(received, ping.text),
      ),
    )
    return yield* Queue.takeN(received, count)
  }).pipe(Effect.scoped)

type MakeClient = Effect.Effect<Layer.Layer<QueueClient, unknown>, never, Scope.Scope>

const sendPings = Effect.fnUntraced(function* (
  ...messages: ReadonlyArray<[id: string, text: string]>
) {
  for (const [id, text] of messages) yield* send(pings, new Ping({ id, text }))
})

const suite = (name: string, makeClient: MakeClient) =>
  describe(name, () => {
    const withClient = <A, E>(body: Effect.Effect<A, E, QueueClient | Scope.Scope>) =>
      Effect.flatMap(makeClient, (client) => Effect.provide(body, client))

    it.live('consumes a sent message', () =>
      withClient(
        Effect.gen(function* () {
          yield* sendPings(['a', 'hello'])

          assert.deepStrictEqual(yield* receive(1), ['hello'])
        }),
      ),
    )

    it.live('delivers one job per jobId, the first sent', () =>
      withClient(
        Effect.gen(function* () {
          yield* sendPings(['a', 'first'], ['a', 'repeat'], ['b', 'other'])

          assert.deepStrictEqual(yield* receive(2), ['first', 'other'])
        }),
      ),
    )

    it.live('keeps consuming after a handler fails', () =>
      withClient(
        Effect.gen(function* () {
          yield* sendPings(['a', 'fail'], ['b', 'after'])

          assert.deepStrictEqual(yield* receive(1), ['after'])
        }),
      ),
    )
  })

const memory: MakeClient = Effect.succeed(QueueClient.layerMemory)

const tempQueueFile = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), 'app-template-queue-'))),
  (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
).pipe(Effect.map((dir) => join(dir, 'queue.sqlite')))

const sqliteClient = (filename: string) =>
  QueueClient.layerSqlite({
    filename,
    lockExpiration: '15 seconds',
    lockRefreshInterval: '5 seconds',
  })

const sqlite: MakeClient = Effect.map(tempQueueFile, sqliteClient)

suite('send and worker on QueueClient.layerMemory', memory)
suite('send and worker on QueueClient.layerSqlite', sqlite)

const flaky = { ...pings, name: 'flaky', maxAttempts: 3 } satisfies QueueDefinition<typeof Ping>

type Seen = readonly [text: string, attempt: AttemptInfo]

const recordAttempts = (seen: Queue.Queue<Seen>) => (ping: Ping, attempt: AttemptInfo) =>
  Queue.offer(seen, [ping.text, attempt])

const recordAttemptsFailingOn =
  (seen: Queue.Queue<Seen>, failOn: string) => (ping: Ping, attempt: AttemptInfo) =>
    recordAttempts(seen)(ping, attempt).pipe(
      Effect.andThen(ping.text === failOn ? Effect.fail('handler failed') : Effect.void),
    )

const layerOverStore = (store: Layer.Layer<PersistedQueue.PersistedQueueStore>) =>
  QueueClient.layer.pipe(Layer.provide(store))

// Advances the clock until the handler records an attempt, so a retry is found whether its delay
// started before or after the previous advance.
const awaitNextAttempt = (seen: Queue.Queue<Seen>) =>
  TestClock.adjust('1 second').pipe(
    Effect.andThen(Queue.poll(seen)),
    Effect.repeat({ until: Option.isSome }),
    Effect.map(Option.getOrThrow),
  )

describe('worker attempt info on QueueClient.layerMemory', () => {
  it.effect('counts every failed attempt, dead-letters the last and keeps consuming', () => {
    const { logs, recordLogs } = makeLogRecorder()
    return Effect.gen(function* () {
      const seen = yield* Queue.unbounded<Seen>()
      yield* Layer.build(worker(flaky, recordAttemptsFailingOn(seen, 'fail')))

      yield* send(flaky, new Ping({ id: 'a', text: 'fail' }))
      const attempts = [
        yield* awaitNextAttempt(seen),
        yield* awaitNextAttempt(seen),
        yield* awaitNextAttempt(seen),
      ]
      yield* TestClock.adjust('1 minute')
      const afterLast = yield* Queue.poll(seen)
      yield* send(flaky, new Ping({ id: 'b', text: 'after' }))

      assert.deepStrictEqual(attempts, [
        ['fail', { attempt: 1, maxAttempts: 3, isLastAttempt: false }],
        ['fail', { attempt: 2, maxAttempts: 3, isLastAttempt: false }],
        ['fail', { attempt: 3, maxAttempts: 3, isLastAttempt: true }],
      ])
      assert.deepStrictEqual(afterLast, Option.none())
      assert.deepStrictEqual(yield* awaitNextAttempt(seen), [
        'after',
        { attempt: 1, maxAttempts: 3, isLastAttempt: false },
      ])
      assert.deepStrictEqual(logs, [
        ['Warn', 'queue message attempt failed', 'flaky'],
        ['Warn', 'queue message attempt failed', 'flaky'],
        ['Error', 'queue message dead-lettered', 'flaky'],
      ])
    }).pipe(Effect.provide(Layer.mergeAll(QueueClient.layerMemory, recordLogs)))
  })

  it.effect("closing a worker's scope hands its job to the next worker, unlogged", () => {
    const { logs, recordLogs } = makeLogRecorder()
    return Effect.gen(function* () {
      const seen = yield* Queue.unbounded<Seen>()
      const hang = worker(flaky, (ping, attempt) =>
        Queue.offer(seen, [ping.text, attempt]).pipe(Effect.andThen(Effect.never)),
      )

      yield* send(flaky, new Ping({ id: 'a', text: 'slow' }))
      const interrupted = yield* Layer.build(hang).pipe(
        Effect.andThen(Queue.take(seen)),
        Effect.scoped,
      )
      yield* Layer.build(hang)

      assert.deepStrictEqual(
        [interrupted, yield* Queue.take(seen)],
        [
          ['slow', { attempt: 1, maxAttempts: 3, isLastAttempt: false }],
          ['slow', { attempt: 1, maxAttempts: 3, isLastAttempt: false }],
        ],
      )
      assert.deepStrictEqual(logs, [])
    }).pipe(Effect.provide(Layer.mergeAll(QueueClient.layerMemory, recordLogs)))
  })
})

const makeLogRecorder = () => {
  const logs: Array<readonly [level: string, message: unknown, queue: unknown]> = []
  const logger = Logger.make<unknown, void>(({ logLevel, message, fiber }) => {
    const first = Array.isArray(message) ? message[0] : message
    logs.push([logLevel, first, fiber.getRef(References.CurrentLogAnnotations).queue])
  })
  return { logs, recordLogs: Logger.layer([logger]) }
}

const failFirstTake = (failure: Effect.Effect<never, PersistedQueue.PersistedQueueError>) =>
  Layer.effect(
    PersistedQueue.PersistedQueueStore,
    Effect.gen(function* () {
      const store = yield* PersistedQueue.PersistedQueueStore
      const failuresLeft = yield* Ref.make(1)
      return PersistedQueue.PersistedQueueStore.of({
        ...store,
        take: Effect.fnUntraced(function* (options) {
          const left = yield* Ref.getAndUpdate(failuresLeft, (n) => n - 1)
          return yield* left > 0 ? failure : store.take(options)
        }),
      })
    }),
  ).pipe(Layer.provide(PersistedQueue.layerStoreMemory))

const storeFailures = [
  ['a typed failure', Effect.fail(new PersistedQueue.PersistedQueueError({ message: 'down' }))],
  ['a defect', Effect.die(new Error('ack failed'))],
] as const

describe('worker on a failing store', () => {
  for (const [kind, failure] of storeFailures) {
    it.effect(`logs ${kind} as an error and resumes consuming after a backoff`, () => {
      const { logs, recordLogs } = makeLogRecorder()
      return Effect.gen(function* () {
        const seen = yield* Queue.unbounded<Seen>()
        yield* Layer.build(worker(flaky, recordAttempts(seen)))

        yield* send(flaky, new Ping({ id: 'a', text: 'after outage' }))
        yield* TestClock.adjust('999 millis')
        const beforeBackoff = yield* Queue.poll(seen)

        assert.deepStrictEqual(beforeBackoff, Option.none())
        assert.deepStrictEqual(yield* awaitNextAttempt(seen), [
          'after outage',
          { attempt: 1, maxAttempts: 3, isLastAttempt: false },
        ])
        assert.deepStrictEqual(logs, [['Error', 'queue consumer failed', 'flaky']])
      }).pipe(Effect.provide(Layer.mergeAll(layerOverStore(failFirstTake(failure)), recordLogs)))
    })
  }

  it.effect('resumes after a handler interrupts itself, at the same attempt, unlogged', () => {
    const { logs, recordLogs } = makeLogRecorder()
    return Effect.gen(function* () {
      const seen = yield* Queue.unbounded<Seen>()
      const calls = yield* Ref.make(0)
      yield* Layer.build(
        worker(flaky, (ping, attempt) =>
          Queue.offer(seen, [ping.text, attempt]).pipe(
            Effect.andThen(Ref.getAndUpdate(calls, (n) => n + 1)),
            Effect.andThen((n) => (n === 0 ? Effect.interrupt : Effect.void)),
          ),
        ),
      )

      yield* send(flaky, new Ping({ id: 'a', text: 'gives up' }))

      assert.deepStrictEqual(
        [yield* awaitNextAttempt(seen), yield* awaitNextAttempt(seen)],
        [
          ['gives up', { attempt: 1, maxAttempts: 3, isLastAttempt: false }],
          ['gives up', { attempt: 1, maxAttempts: 3, isLastAttempt: false }],
        ],
      )
      assert.deepStrictEqual(logs, [])
    }).pipe(Effect.provide(Layer.mergeAll(QueueClient.layerMemory, recordLogs)))
  })
})

const dieWhenSettlingAFailedAttempt = Layer.effect(
  PersistedQueue.PersistedQueueStore,
  Effect.gen(function* () {
    const store = yield* PersistedQueue.PersistedQueueStore
    return PersistedQueue.PersistedQueueStore.of({
      ...store,
      take: (options) =>
        Effect.tap(store.take(options), () =>
          Effect.addFinalizer((exit) =>
            Exit.isFailure(exit) ? Effect.die(new Error('ack failed')) : Effect.void,
          ),
        ),
    })
  }),
).pipe(Layer.provide(PersistedQueue.layerStoreMemory))

describe('worker on a store that dies settling a failed attempt', () => {
  it.effect('logs the defect as an error and keeps consuming', () => {
    const { logs, recordLogs } = makeLogRecorder()
    return Effect.gen(function* () {
      const seen = yield* Queue.unbounded<Seen>()
      yield* Layer.build(worker(pings, recordAttemptsFailingOn(seen, 'fail')))

      yield* send(pings, new Ping({ id: 'a', text: 'fail' }))
      yield* awaitNextAttempt(seen)
      yield* send(pings, new Ping({ id: 'b', text: 'after' }))

      assert.deepStrictEqual(yield* awaitNextAttempt(seen), [
        'after',
        { attempt: 1, maxAttempts: 1, isLastAttempt: true },
      ])
      assert.deepStrictEqual(
        logs.filter(([level]) => level === 'Error'),
        [
          ['Error', 'queue message dead-lettered', 'pings'],
          ['Error', 'queue store failed settling an attempt', 'pings'],
        ],
      )
    }).pipe(
      Effect.provide(Layer.mergeAll(layerOverStore(dieWhenSettlingAFailedAttempt), recordLogs)),
    )
  })
})

describe('QueueClient.layerSqlite', () => {
  it.live('keeps a message for a layer rebuilt on the same file', () =>
    Effect.gen(function* () {
      const filename = yield* tempQueueFile
      yield* sendPings(['a', 'kept']).pipe(Effect.provide(sqliteClient(filename)))

      assert.deepStrictEqual(yield* receive(1).pipe(Effect.provide(sqliteClient(filename))), [
        'kept',
      ])
    }),
  )
})
