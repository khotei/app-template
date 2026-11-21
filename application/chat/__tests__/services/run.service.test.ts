import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Cause, Effect, Option, Struct } from 'effect'

import type { RunEntitySet, RunEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { RunNotFoundError, RunStatusInvalidError } from '#chat/domain/run.error'
import { activeRunStatuses, completeRun, failRun, Run, startRun } from '#chat/domain/run.model'
import type { RunStatus } from '#chat/domain/run-fields.model'
import { RunService } from '#chat/services/run.service'
import { assistantMessageAt, queuedRun } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

/** Each move, the status it leaves from and the status it writes. */
const moves: ReadonlyArray<{
  readonly name: string
  readonly from: RunStatus
  readonly to: RunStatus
  readonly move: (run: Run) => Effect.Effect<Run>
}> = [
  { name: 'startRun', from: 'queued', to: 'generating', move: startRun },
  {
    name: 'completeRun',
    from: 'generating',
    to: 'done',
    move: completeRun(assistantMessageAt(1, 'Sure.')),
  },
  {
    name: 'failRun',
    from: 'queued',
    to: 'failed',
    move: failRun(Cause.fail('SQS is unavailable')),
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
  it.effect.each(moves)(
    'update by $name writes the $to Run under the status it was read in',
    ({ from, to, move }) => {
      const run = new Run({ ...queuedRun, status: from })
      const { updates, layer } = recordUpdates()
      return Effect.gen(function* () {
        const service = yield* RunService

        const moved = yield* service.update(run, move)

        assert.strictEqual(moved.status, to)
        assert.deepStrictEqual(
          Arr.map(updates, ([set, where]) => [set.status, where]),
          [[to, { id: run.id, status: [from] }]],
        )
      }).pipe(Effect.provide(layer))
    },
  )

  it.effect('update by a move the model refuses dies with RunStatusInvalidError, unwritten', () => {
    const { updates, layer } = recordUpdates()
    return Effect.gen(function* () {
      const service = yield* RunService

      const defect = yield* service
        .update(queuedRun, completeRun(assistantMessageAt(1, 'Sure.')))
        .pipe(Effect.catchDefect(Effect.succeed))

      assert.instanceOf(defect, RunStatusInvalidError)
      assert.deepStrictEqual(Struct.pick(defect, ['id', 'from', 'to']), {
        id: queuedRun.id,
        from: 'queued',
        to: 'done',
      })
      assert.deepStrictEqual(updates, [])
    }).pipe(Effect.provide(layer))
  })

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
