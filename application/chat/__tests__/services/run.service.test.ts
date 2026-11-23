import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, Effect, Option, Struct } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { RunNotFoundError, RunStatusInvalidError } from '#chat/domain/run.error'
import {
  activeRunStatuses,
  completeRun,
  failRun,
  Run,
  type RunStatus,
  startRun,
} from '#chat/domain/run.model'
import { RunService } from '#chat/services/run.service'
import { assistantMessageAt, queuedRun } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

/** Each transition, the status it leaves from and the status it writes. */
const moves: ReadonlyArray<{
  readonly name: string
  readonly from: RunStatus
  readonly to: RunStatus
  readonly transition: (run: Run) => Effect.Effect<Run>
}> = [
  { name: 'startRun', from: 'queued', to: 'generating', transition: startRun },
  {
    name: 'completeRun',
    from: 'generating',
    to: 'done',
    transition: (run) => completeRun(run, assistantMessageAt(1, 'Sure.').id),
  },
  {
    name: 'failRun',
    from: 'queued',
    to: 'failed',
    transition: (run) => failRun(run, Cause.fail('SQS is unavailable')),
  },
]

/** The service over a `RunRepository` that reads `stored`, whose updates land in `updates`. */
function recordUpdates(stored: Option.Option<Run> = Option.some(queuedRun)) {
  const updates: Array<readonly [typeof Run.update.Type, RunStatus]> = []
  const layer = layerChatTest({
    runs: {
      selectOne: () => Effect.succeed(stored),
      update: (...update) =>
        Effect.sync(() => {
          updates.push(update)
        }),
    },
  })
  return { updates, layer }
}

describe('RunService', () => {
  it.effect.each(moves)(
    'move by $name writes the $to Run under the status it was read in',
    ({ from, to, transition }) => {
      const run = new Run({ ...queuedRun, status: from })
      const { updates, layer } = recordUpdates()
      return Effect.gen(function* () {
        const service = yield* RunService

        const moved = yield* service.move(run, transition)

        assert.strictEqual(moved.status, to)
        assert.deepStrictEqual(
          Arr.map(updates, ([set, readIn]) => [set.status, set.id, readIn]),
          [[to, run.id, from]],
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('move of a Run moved since it was read dies on the guard in the write', () => {
    const wheres: Array<readonly [Run['id'], RunStatus]> = []
    const layer = layerChatTest({
      runs: {
        update: (to, from) =>
          Effect.sync(() => {
            wheres.push([to.id, from])
          }).pipe(Effect.andThen(Effect.die('no run was updated'))),
      },
    })
    return Effect.gen(function* () {
      const service = yield* RunService

      const defect = yield* service
        .move(queuedRun, startRun)
        .pipe(Effect.catchDefect(Effect.succeed))

      assert.strictEqual(defect, 'no run was updated')
      assert.deepStrictEqual(wheres, [[queuedRun.id, 'queued']])
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    'move by a transition the model refuses dies with RunStatusInvalidError, unwritten',
    () => {
      const { updates, layer } = recordUpdates()
      return Effect.gen(function* () {
        const service = yield* RunService

        const defect = yield* service
          .move(queuedRun, (run) => completeRun(run, assistantMessageAt(1, 'Sure.').id))
          .pipe(Effect.catchDefect(Effect.succeed))

        assert.instanceOf(defect, RunStatusInvalidError)
        assert.deepStrictEqual(Struct.pick(defect, ['id', 'from', 'to']), {
          id: queuedRun.id,
          from: 'queued',
          to: 'done',
        })
        assert.deepStrictEqual(updates, [])
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect.each([
    {
      name: 'id',
      where: { id: queuedRun.id, chatId: queuedRun.chatId },
      key: { id: queuedRun.id },
    },
    {
      name: 'user message',
      where: { userMessageId: queuedRun.userMessageId, status: activeRunStatuses },
      key: { userMessageId: queuedRun.userMessageId },
    },
  ])(
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
