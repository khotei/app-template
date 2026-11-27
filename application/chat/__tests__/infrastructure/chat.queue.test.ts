import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer } from 'effect'

import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordMessages } from '@app-template/packages/queue/testing'
import { recordLogs } from '@app-template/packages/testing'

import { ChatQueue, ReplyToMessage } from '#chat/infrastructure/chat.queue'
import { queuedRun } from '#testing/chat/chat.test-fixture'

const refused = new QueueError({ cause: new Error('SQS is unavailable') })

/** `ChatQueue` over a `QueueSender` that SQS refuses. */
const RefusingQueueTest = ChatQueue.layer.pipe(
  Layer.provide(Layer.mock(QueueSender, { send: () => Effect.fail(refused) })),
)

describe('ChatQueue.sendReplyToMessage', () => {
  it.effect("a reply job names the Run's user message, chat and user", () => {
    const jobs = recordMessages()
    const layer = ChatQueue.layer.pipe(Layer.provide(jobs.layer))
    return Effect.gen(function* () {
      const queue = yield* ChatQueue
      yield* queue.sendReplyToMessage(queuedRun)

      assertEquals(yield* jobs.sent, [
        {
          queue: 'reply-to-message',
          message: new ReplyToMessage({
            messageId: queuedRun.userMessageId,
            chatId: queuedRun.chatId,
            userId: queuedRun.userId,
          }),
        },
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect(
    'a reply job SQS refuses is logged with its chat, Run, message and error, and fails it',
    () => {
      const { logs, layer: logger } = recordLogs('chatId', 'runId', 'messageId')
      return Effect.gen(function* () {
        const queue = yield* ChatQueue
        const error = yield* queue.sendReplyToMessage(queuedRun).pipe(Effect.flip)

        assert.strictEqual(error, refused)
        assert.deepStrictEqual(logs, [
          [
            'Error',
            'reply job not queued',
            queuedRun.chatId,
            queuedRun.id,
            queuedRun.userMessageId,
            refused,
          ],
        ])
      }).pipe(Effect.provide([RefusingQueueTest, logger]))
    },
  )
})

describe('ChatQueue.sendFirstMessageCreated', () => {
  it.effect(
    "a first message's event SQS refuses is logged with its ids and error, and the ask goes on",
    () => {
      const { logs, layer: logger } = recordLogs('messageId', 'chatId', 'userId')
      return Effect.gen(function* () {
        const queue = yield* ChatQueue
        yield* queue.sendFirstMessageCreated(queuedRun)

        assert.deepStrictEqual(logs, [
          [
            'Error',
            'first message event not queued',
            queuedRun.userMessageId,
            queuedRun.chatId,
            queuedRun.userId,
            refused,
          ],
        ])
      }).pipe(Effect.provide([RefusingQueueTest, logger]))
    },
  )
})
