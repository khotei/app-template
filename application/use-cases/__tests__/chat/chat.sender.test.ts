import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Layer } from 'effect'

import { RunNotQueuedError } from '@app-template/application/chat'
import { layerChatTest, queuedRun } from '@app-template/application/chat/testing'
import type { RunEntitySet, RunEntityWhere } from '@app-template/kernel/data'
import { QueueError, QueueSender } from '@app-template/packages/queue'
import { assertSchemaEquals, recordLogs } from '@app-template/packages/testing'

import { sendGenerateAssistantMessage } from '#use-cases/chat/chat.sender'

/** A `QueueSender` that SQS refuses. */
const RefusingQueueTest = Layer.mock(QueueSender, {
  send: () => Effect.fail(new QueueError({ cause: new Error('SQS is unavailable') })),
})

describe('sendGenerateAssistantMessage', () => {
  it.effect(
    'a send SQS refuses fails the queued Run with ReplyFailed and is RunNotQueuedError',
    () => {
      const { logs, layer: logger } = recordLogs('chatId', 'runId')
      const updates: Array<readonly [RunEntitySet, RunEntityWhere]> = []
      return Effect.gen(function* () {
        const error = yield* sendGenerateAssistantMessage(queuedRun).pipe(Effect.flip)

        assertSchemaEquals(RunNotQueuedError, error, new RunNotQueuedError({ id: queuedRun.id }))
        assert.deepStrictEqual(
          Arr.map(updates, ([set, where]) => ({
            status: set.status,
            reason: set.failure?.reason,
            where,
          })),
          [
            {
              status: 'failed',
              reason: 'ReplyFailed',
              where: { id: queuedRun.id, status: ['queued'] },
            },
          ],
        )
        assert.deepStrictEqual(logs, [
          ['Error', 'assistant message not queued', queuedRun.chatId, queuedRun.id],
        ])
      }).pipe(
        Effect.provide([
          RefusingQueueTest,
          layerChatTest({
            runs: {
              update: (...update) =>
                Effect.sync(() => {
                  updates.push(update)
                }),
            },
          }),
          logger,
        ]),
      )
    },
  )
})
