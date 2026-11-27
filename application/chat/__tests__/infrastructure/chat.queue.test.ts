import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordLogs } from '@app-template/packages/testing'

import { ChatQueue } from '#chat/infrastructure/chat.queue'
import { queuedRun } from '#testing/chat/chat.test-fixture'

const refused = new QueueError({ cause: new Error('SQS is unavailable') })

/** `ChatQueue` over a `QueueSender` that SQS refuses. */
const RefusingQueueTest = ChatQueue.layer.pipe(
  Layer.provide(Layer.mock(QueueSender, { send: () => Effect.fail(refused) })),
)

describe('ChatQueue.sendReplyToMessage', () => {
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
