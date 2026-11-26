import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordLogs } from '@app-template/packages/testing'

import { ChatQueue } from '#chat/infrastructure/chat.queue'
import { chat, queuedRun } from '#testing/chat/chat.test-fixture'

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

describe('ChatQueue.sendTitleChat', () => {
  it.effect(
    'a title job SQS refuses is logged with its chat and error, and the ask goes on',
    () => {
      const { logs, layer: logger } = recordLogs('chatId')
      return Effect.gen(function* () {
        const queue = yield* ChatQueue
        yield* queue.sendTitleChat(chat)

        assert.deepStrictEqual(logs, [['Error', 'title job not queued', chat.id, refused]])
      }).pipe(Effect.provide([RefusingQueueTest, logger]))
    },
  )
})
