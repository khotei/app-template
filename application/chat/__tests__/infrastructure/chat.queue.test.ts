import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordLogs } from '@app-template/packages/testing'

import { sendGenerateChatTitle } from '#chat/infrastructure/chat.queue'
import { chatId, messageId } from '#testing/chat/chat.test-fixture'

/** A `QueueSender` that SQS refuses. */
const RefusingQueueTest = Layer.mock(QueueSender, {
  send: () => Effect.fail(new QueueError({ cause: new Error('SQS is unavailable') })),
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
