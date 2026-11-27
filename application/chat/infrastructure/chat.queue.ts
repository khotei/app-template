import { Cause, Context, Effect, Layer, Schema, Struct, type Types } from 'effect'

import { UserId } from '@app-template/application/user'
import { resources } from '@app-template/kernel/aws'
import { type QueueDefinition, type QueueError, QueueSender } from '@app-template/packages/queue'

import { ChatId } from '#chat/domain/chat.util'
import type { Message } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'

const { userMessageCreated, chatInitialized, messageRetried } = resources.queues

/** The user's message an event names, by its id, chat and user. */
type EventMessage = Types.Simplify<Pick<Message, 'id' | 'chatId' | 'userId'>>

/** The three events' fields: ids alone, never the message's text, which no listener reads. */
const eventFields = { chatId: ChatId, userId: UserId, messageId: MessageId }

/** The user's message `messageId` was stored in the chat `chatId`, of the user `userId`. */
export class UserMessageCreated extends Schema.Class<UserMessageCreated>('UserMessageCreated')(
  eventFields,
) {
  static readonly queue = {
    name: userMessageCreated.name,
    schema: this,
  } satisfies QueueDefinition<typeof UserMessageCreated>
}

/** The chat `chatId`, of the user `userId`, got its first user message, `messageId`. */
export class ChatInitialized extends Schema.Class<ChatInitialized>('ChatInitialized')(eventFields) {
  static readonly queue = {
    name: chatInitialized.name,
    schema: this,
  } satisfies QueueDefinition<typeof ChatInitialized>
}

/** The user retried the reply to their message `messageId`, in the chat `chatId`, of `userId`. */
export class MessageRetried extends Schema.Class<MessageRetried>('MessageRetried')(eventFields) {
  static readonly queue = {
    name: messageRetried.name,
    schema: this,
  } satisfies QueueDefinition<typeof MessageRetried>
}

/** An event's fields for the message, which its send's logs carry too. */
const buildEventFields = (message: EventMessage) => ({
  ...Struct.pick(message, ['chatId', 'userId']),
  messageId: message.id,
})

/** Hands the worker the chat's events, each on its own queue. */
export class ChatQueue extends Context.Service<
  ChatQueue,
  {
    /**
     * Sends the event that the user's message was stored; one SQS refuses is logged and fails with
     * its `QueueError`, as the message's Run then has no reply to wait for.
     */
    readonly sendUserMessageCreated: (message: EventMessage) => Effect.Effect<void, QueueError>
    /**
     * Sends the event that the user retried their message's reply; one SQS refuses is logged and
     * fails with its `QueueError`, as `sendUserMessageCreated`'s.
     */
    readonly sendMessageRetried: (message: EventMessage) => Effect.Effect<void, QueueError>
    /**
     * Sends the event that the message is its chat's first; one SQS refuses is logged, and the ask
     * goes on.
     */
    readonly sendChatInitialized: (message: EventMessage) => Effect.Effect<void>
  }
>()('@app-template/application/chat/infrastructure/ChatQueue', {
  make: Effect.gen(function* () {
    const queue = yield* QueueSender

    const sendUserMessageCreated = Effect.fn('ChatQueue.sendUserMessageCreated')(
      (message: EventMessage) =>
        queue.send(UserMessageCreated.queue, new UserMessageCreated(buildEventFields(message))),
      Effect.tapError((error) =>
        Effect.logError("user message's event not queued", Cause.fail(error)),
      ),
      (sent, message) => Effect.annotateLogs(sent, buildEventFields(message)),
    )

    const sendMessageRetried = Effect.fn('ChatQueue.sendMessageRetried')(
      (message: EventMessage) =>
        queue.send(MessageRetried.queue, new MessageRetried(buildEventFields(message))),
      Effect.tapError((error) => Effect.logError("retry's event not queued", Cause.fail(error))),
      (sent, message) => Effect.annotateLogs(sent, buildEventFields(message)),
    )

    const sendChatInitialized = Effect.fn('ChatQueue.sendChatInitialized')(
      (message: EventMessage) =>
        queue.send(ChatInitialized.queue, new ChatInitialized(buildEventFields(message))),
      Effect.ignore({ log: 'Error', message: "chat's initialization event not queued" }),
      (sent, message) => Effect.annotateLogs(sent, buildEventFields(message)),
    )

    return { sendUserMessageCreated, sendMessageRetried, sendChatInitialized }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
