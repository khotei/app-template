import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assert, describe, it } from '@effect/vitest'
import { Effect, Fiber, type Layer, Queue, Schedule, Schema, type Scope } from 'effect'

import { QueueClientMemory } from '#queue/memory'
import { QueueClient, type QueueDefinition } from '#queue/queue'
import { createQueueClientSqlite } from '#queue/sqlite'

class Ping extends Schema.Class<Ping>('Ping')({ text: Schema.String }) {}

const pings = {
  name: 'pings',
  schema: Ping,
  maxAttempts: 1,
  retrySchedule: Schedule.spaced('1 second'),
} satisfies QueueDefinition<typeof Ping>

const receive = Effect.fnUntraced(function* (count: number) {
  const { consume } = yield* QueueClient.use((client) => client.make(pings))
  const received = yield* Queue.unbounded<string>()
  const fiber = yield* Effect.forkScoped(
    consume((ping) =>
      ping.text === 'fail' ? Effect.fail('handler failed') : Queue.offer(received, ping.text),
    ),
  )
  const texts = yield* Queue.takeN(received, count)
  yield* Fiber.interrupt(fiber)
  return texts
})

type MakeClient = Effect.Effect<Layer.Layer<QueueClient, unknown>, never, Scope.Scope>

const sendPings = Effect.fnUntraced(function* (
  ...messages: ReadonlyArray<[id: string, text: string]>
) {
  const { send } = yield* QueueClient.use((client) => client.make(pings))
  for (const [id, text] of messages) yield* send(new Ping({ text }), { id })
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

    it.live('delivers a repeated id once', () =>
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

const memory: MakeClient = Effect.succeed(QueueClientMemory)

const tempQueueFile = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), 'app-template-queue-'))),
  (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
).pipe(Effect.map((dir) => join(dir, 'queue.sqlite')))

const sqliteClient = (filename: string) =>
  createQueueClientSqlite({
    filename,
    lockExpiration: '15 seconds',
    lockRefreshInterval: '5 seconds',
  })

const sqlite: MakeClient = Effect.map(tempQueueFile, sqliteClient)

suite('JobQueue on QueueClientMemory', memory)
suite('JobQueue on createQueueClientSqlite', sqlite)

describe('createQueueClientSqlite', () => {
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
