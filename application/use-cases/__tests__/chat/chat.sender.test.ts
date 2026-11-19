import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Layer } from 'effect'

import { layerChatTest, queuedRun } from '@app-template/application/chat/testing'
import type { RunEntitySet, RunEntityWhere } from '@app-template/kernel/data'
import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordLogs } from '@app-template/packages/testing'

import { sendGenerateAssistantMessage } from '#use-cases/chat/chat.sender'

const refused = new QueueError({ cause: new Error('SQS is unavailable') })

/** A `QueueSender` that SQS refuses. */
const RefusingQueueTest = Layer.mock(QueueSender, { send: () => Effect.fail(refused) })

describe('sendGenerateAssistantMessage', () => {
  it.effect(
    "a send SQS refuses is logged, and fails the queued Run with the queue's error and answers it",
    () => {
      const { logs, layer: logger } = recordLogs('chatId', 'runId')
      const updates: Array<readonly [RunEntitySet, RunEntityWhere]> = []
      return Effect.gen(function* () {
        const run = yield* sendGenerateAssistantMessage(queuedRun)

        assert.strictEqual(run.status, 'failed')
        assert.deepStrictEqual(
          Arr.map(updates, ([set, where]) => ({
            status: set.status,
            reason: set.failure?.reason,
            where,
          })),
          [
            {
              status: 'failed',
              reason: 'QueueError',
              where: { id: queuedRun.id, status: ['queued'] },
            },
          ],
        )
        assert.include(updates[0]?.[0].failure?.cause, 'SQS is unavailable')
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
