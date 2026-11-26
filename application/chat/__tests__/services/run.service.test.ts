import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, DateTime, Effect, Exit, Option } from 'effect'

import {
  activeRunStatuses as indexedRunStatuses,
  type RunEntitySelectWhere,
  type RunEntitySet,
  type RunEntityWhere,
} from '@app-template/kernel/data'
import { encodeWith, RowCodec } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch } from '@app-template/packages/testing'

import { activeRunStatuses, Run, RunNotFoundError, type RunStatus } from '#chat/domain/run.model'
import { RunMove } from '#chat/domain/run-move'
import { RunService, type RunWhere } from '#chat/services/run.service'
import { assistantMessageAt, queuedRun, runUsage } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

/** Each move, the status it leaves from and the status it writes. */
const moves: ReadonlyArray<{
  readonly name: string
  readonly from: RunStatus
  readonly to: RunStatus
  readonly move: (run: Run) => Effect.Effect<Run>
}> = [
  { name: 'start', from: 'queued', to: 'generating', move: RunMove.start },
  {
    name: 'complete',
    from: 'generating',
    to: 'done',
    move: (run) => RunMove.complete(run, assistantMessageAt(1, 'Sure.').id, runUsage),
  },
  {
    name: 'fail',
    from: 'queued',
    to: 'failed',
    move: (run) => RunMove.fail(run, Cause.fail('SQS is unavailable')),
  },
]

/** Each read a where names: the filter the repository takes for it, and its key alone. */
const reads: ReadonlyArray<{
  readonly name: string
  readonly where: RunWhere
  readonly filter: RunEntitySelectWhere
  readonly key: RunNotFoundError['where']
}> = [
  {
    name: 'id',
    where: { id: queuedRun.id, chatId: queuedRun.chatId, userId: queuedRun.userId },
    filter: { id: queuedRun.id, chatId: queuedRun.chatId, userId: queuedRun.userId },
    key: { id: queuedRun.id },
  },
  {
    name: 'user message',
    where: { userMessageId: queuedRun.userMessageId, status: activeRunStatuses },
    filter: { userMessageId: queuedRun.userMessageId, status: { in: ['queued', 'generating'] } },
    key: { userMessageId: queuedRun.userMessageId },
  },
]

/** The service over a `RunRepository` that reads `stored`, whose updates land in `updates`. */
function recordUpdates(stored: Option.Option<Run> = Option.some(queuedRun)) {
  const updates: Array<readonly [RunEntitySet, RunEntityWhere]> = []
  const read = stored.pipe(Option.map(encodeWith(Run)), Effect.transposeOption)
  const layer = layerChatTest({
    runs: {
      selectOne: () => read,
      update: (...update) =>
        Effect.sync(() => {
          updates.push(update)
        }),
    },
  })
  return { updates, layer }
}

describe('RunService', () => {
  // The model and the table each declare the active statuses and no call hands one to the other,
  // so no type compares them: diverged, the busy rule lets through an ask the partial unique
  // index refuses, or the index stores two active Runs of a chat.
  it('holds as active the statuses the partial unique index holds', () => {
    assert.sameMembers([...activeRunStatuses], [...indexedRunStatuses])
  })

  it.effect.each(moves)(
    'update by $name writes the $to Run under the status it was read in',
    ({ from, to, move }) => {
      const run = new Run({ ...queuedRun, status: from })
      const { updates, layer } = recordUpdates()
      return Effect.gen(function* () {
        const service = yield* RunService

        const moved = yield* service.update(run, yield* move(run))

        assert.strictEqual(moved.status, to)
        assert.deepStrictEqual(
          Arr.map(updates, ([set, where]) => [set.status, where]),
          [[to, { id: run.id, status: from }]],
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('update of a Run moved since it was read dies on the guard in the write', () => {
    const wheres: Array<RunEntityWhere> = []
    const layer = layerChatTest({
      runs: {
        update: (_, where) =>
          Effect.sync(() => {
            wheres.push(where)
          }).pipe(Effect.andThen(Effect.die('no run was updated'))),
      },
    })
    return Effect.gen(function* () {
      const service = yield* RunService
      const started = yield* RunMove.start(queuedRun)

      const defect = yield* service
        .update(queuedRun, started)
        .pipe(Effect.catchDefect(Effect.succeed))

      assert.strictEqual(defect, 'no run was updated')
      assert.deepStrictEqual(wheres, [{ id: queuedRun.id, status: 'queued' }])
    }).pipe(Effect.provide(layer))
  })

  it.effect('update writes a Run as read with its updatedAt moved to now', () => {
    const { updates, layer } = recordUpdates()
    return Effect.gen(function* () {
      const service = yield* RunService
      const read = new Run({ ...queuedRun, updatedAt: DateTime.makeUnsafe('2026-11-09T00:00Z') })
      const failed = yield* RunMove.fail(read, Cause.fail('529 overloaded'))

      const moved = yield* service.update(read, failed)

      assert.deepStrictEqual(moved.updatedAt, epoch)
      assert.deepStrictEqual(
        Arr.map(updates, ([set]) => [set.status, set.failure, set.updatedAt]),
        [['failed', Option.getOrThrow(failed.failure), DateTime.toDateUtc(epoch)]],
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(reads)(
    "getOne by $name reads the Run under its where's filter",
    ({ where, filter }) => {
      const filters: Array<RunEntitySelectWhere> = []
      const layer = layerChatTest({
        runs: {
          selectOne: (read) =>
            Effect.sync(() => {
              filters.push(read)
            }).pipe(Effect.andThen(encodeWith(Run)(queuedRun)), Effect.map(Option.some)),
        },
      })
      return Effect.gen(function* () {
        const service = yield* RunService

        const found = yield* service.getOne(where)

        assert.strictEqual(found.id, queuedRun.id)
        assert.deepStrictEqual(filters, [filter])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect.each(reads)(
    'getOne by $name the store finds none of fails RunNotFoundError by its key alone',
    ({ where, key }) => {
      const { layer } = recordUpdates(Option.none())
      return Effect.gen(function* () {
        const service = yield* RunService

        const error = yield* service.getOne(where).pipe(Effect.flip)

        assertSchemaEquals(RunNotFoundError, error, new RunNotFoundError({ where: key }))
      }).pipe(Effect.provide(layer))
    },
  )
})

describe("a Run's update, as its service codes it", () => {
  it.effect('keeps its status, failure and reply typed, and dies on another type', () =>
    Effect.gen(function* () {
      const update = RowCodec.makeUpdate(Run)

      // @ts-expect-error a status is one of a Run's
      const lost = yield* update({ ...queuedRun, status: 'lost' }).pipe(Effect.exit)
      // @ts-expect-error a failure is an Option of a RunFailure
      const failed = yield* update({ ...queuedRun, failure: 'down' }).pipe(Effect.exit)
      // @ts-expect-error a reply is an Option of a MessageId
      const reply = yield* update({ ...queuedRun, assistantMessageId: 'x' }).pipe(Effect.exit)

      assert.deepStrictEqual(Arr.map([lost, failed, reply], Exit.hasDies), [true, true, true])
    }),
  )
})
