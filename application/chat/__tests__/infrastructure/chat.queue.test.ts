import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer } from 'effect'

import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordMessages } from '@app-template/packages/queue/testing'
import { recordLogs } from '@app-template/packages/testing'

import {
  ChatInitialized,
  ChatQueue,
  MessageRetried,
  UserMessageCreated,
} from '#chat/infrastructure/chat.queue'
import { firstMessage } from '#testing/chat/chat.test-fixture'

const refused = new QueueError({ cause: new Error('SQS is unavailable') })

/** `ChatQueue` over a `QueueSender` that SQS refuses. */
const RefusingQueueTest = ChatQueue.layer.pipe(
  Layer.provide(Layer.mock(QueueSender, { send: () => Effect.fail(refused) })),
)

const ids = { chatId: firstMessage.chatId, userId: firstMessage.userId, messageId: firstMessage.id }

const sendUserMessageCreated = (queue: ChatQueue['Service']) =>
  queue.sendUserMessageCreated(firstMessage)
const sendMessageRetried = (queue: ChatQueue['Service']) => queue.sendMessageRetried(firstMessage)

describe('ChatQueue', () => {
  it.effect.each([
    {
      name: 'sendUserMessageCreated',
      send: sendUserMessageCreated,
      sent: { queue: 'user-message-created', message: new UserMessageCreated(ids) },
    },
    {
      name: 'sendMessageRetried',
      send: sendMessageRetried,
      sent: { queue: 'message-retried', message: new MessageRetried(ids) },
    },
    {
      name: 'sendChatInitialized',
      send: (queue: ChatQueue['Service']) => queue.sendChatInitialized(firstMessage),
      sent: { queue: 'chat-initialized', message: new ChatInitialized(ids) },
    },
  ])('$name sends the event naming the message, its chat and its user', ({ send, sent }) => {
    const events = recordMessages()
    const layer = ChatQueue.layer.pipe(Layer.provide(events.layer))
    return Effect.gen(function* () {
      yield* send(yield* ChatQueue)

      assertEquals(yield* events.sent, [sent])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each([
    {
      name: 'sendUserMessageCreated',
      send: sendUserMessageCreated,
      log: "user message's event not queued",
    },
    { name: 'sendMessageRetried', send: sendMessageRetried, log: "retry's event not queued" },
  ])('$name SQS refuses is logged with its ids and error, and fails with it', ({ send, log }) => {
    const { logs, layer: logger } = recordLogs('chatId', 'userId', 'messageId')
    return Effect.gen(function* () {
      const error = yield* send(yield* ChatQueue).pipe(Effect.flip)

      assert.strictEqual(error, refused)
      assert.deepStrictEqual(logs, [['Error', log, ids.chatId, ids.userId, ids.messageId, refused]])
    }).pipe(Effect.provide([RefusingQueueTest, logger]))
  })

  it.effect(
    'sendChatInitialized SQS refuses is logged with its ids and error, and the ask goes on',
    () => {
      const { logs, layer: logger } = recordLogs('chatId', 'userId', 'messageId')
      return Effect.gen(function* () {
        const queue = yield* ChatQueue
        yield* queue.sendChatInitialized(firstMessage)

        assert.deepStrictEqual(logs, [
          [
            'Error',
            "chat's initialization event not queued",
            ids.chatId,
            ids.userId,
            ids.messageId,
            refused,
          ],
        ])
      }).pipe(Effect.provide([RefusingQueueTest, logger]))
    },
  )
})
