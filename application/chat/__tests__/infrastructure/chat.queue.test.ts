import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordLogs } from '@app-template/packages/testing'

import {
  sendGenerateAssistantMessage,
  sendGenerateChatTitle,
} from '#chat/infrastructure/chat.queue'
import { chatId, messageId, queuedRun } from '#testing/chat/chat.test-fixture'

const refused = new QueueError({ cause: new Error('SQS is unavailable') })

/** A `QueueSender` that SQS refuses. */
const RefusingQueueTest = Layer.mock(QueueSender, { send: () => Effect.fail(refused) })

describe('sendGenerateAssistantMessage', () => {
  it.effect('a reply job SQS refuses is logged with its chat and Run, and fails QueueError', () => {
    const { logs, layer: logger } = recordLogs('chatId', 'runId')
    return Effect.gen(function* () {
      const error = yield* sendGenerateAssistantMessage(queuedRun).pipe(Effect.flip)

      assert.strictEqual(error, refused)
      assert.deepStrictEqual(logs, [
        ['Error', 'assistant message not queued', queuedRun.chatId, queuedRun.id],
      ])
    }).pipe(Effect.provide([RefusingQueueTest, logger]))
  })
})

describe('sendGenerateChatTitle', () => {
  it.effect(
    'a title job SQS refuses is logged with its chat and message, and the send goes on',
    () => {
      const { logs, layer: logger } = recordLogs('chatId', 'messageId')
      return Effect.gen(function* () {
        yield* sendGenerateChatTitle({ id: messageId, chatId })

        assert.deepStrictEqual(logs, [['Error', 'chat title not queued', chatId, messageId]])
      }).pipe(Effect.provide([RefusingQueueTest, logger]))
    },
  )
})
