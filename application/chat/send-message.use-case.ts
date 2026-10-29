import { Context, Crypto, Effect, Layer, Predicate } from 'effect'

import {
  type AttachmentBoundError,
  type AttachmentNotFoundError,
  AttachmentService,
} from '@app-template/domain/attachment'
import {
  buildAssistantMessage,
  buildUserMessage,
  type ChatBusyError,
  type ChatId,
  ChatNotFoundError,
  ChatRepository,
  ChatService,
  generateMessageId,
  type MessageDetail,
  type MessageInput,
  type MessageInputInvalidError,
  MessageRepository,
} from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'
import {
  assistantMessageQueue,
  chatTitleQueue,
  GenerateAssistantMessage,
  GenerateChatTitle,
} from '@app-template/infrastructure/chat'
import { Transaction } from '@app-template/infrastructure/db'
import { QueueClient } from '@app-template/queue'

export interface SentMessages {
  readonly userMessage: MessageDetail
  readonly assistantMessage: MessageDetail
}

export class SendMessageUseCase extends Context.Service<
  SendMessageUseCase,
  {
    /** Stores the user's message with a queued reply, binds its attachments and queues the jobs. */
    readonly send: (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) => Effect.Effect<
      SentMessages,
      | MessageInputInvalidError
      | ChatNotFoundError
      | ChatBusyError
      | AttachmentNotFoundError
      | AttachmentBoundError
    >
  }
>()('@app-template/application/chat/SendMessageUseCase', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const chatService = yield* ChatService
    const messages = yield* MessageRepository
    const attachmentService = yield* AttachmentService
    const queue = yield* QueueClient
    const transaction = yield* Transaction
    const crypto = yield* Crypto.Crypto
    const generateId = generateMessageId.pipe(Effect.provideService(Crypto.Crypto, crypto))

    const send = Effect.fn('SendMessageUseCase.send')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const sendable = yield* chatService.findSendable(userId, chatId, input)

      // A rule-free write, before the messages: a chat deleted since the check reads as gone.
      yield* chats
        .update({ updatedAt: sendable.at }, { id: chatId })
        .pipe(Effect.filterOrFail(Predicate.isTruthy, () => new ChatNotFoundError({ id: chatId })))

      const userMessageId = yield* generateId
      const userMessage = buildUserMessage({
        id: userMessageId,
        chatId,
        text: sendable.input.text,
        createdAt: sendable.at,
      })
      yield* messages.insert(userMessage)
      const bound = yield* attachmentService.bind(userId, input.attachmentIds, userMessage.id)
      const assistantMessageId = yield* generateId
      const assistantMessage = buildAssistantMessage({
        id: assistantMessageId,
        chatId,
        createdAt: sendable.at,
      })
      yield* messages.insert(assistantMessage)
      // A QueueError is a defect: no rule reads it, and it still rolls the send back.
      yield* queue
        .send(
          assistantMessageQueue,
          new GenerateAssistantMessage({ chatId, messageId: assistantMessage.id }),
        )
        .pipe(Effect.orDie)
      if (sendable.opensChat) {
        yield* queue
          .send(chatTitleQueue, new GenerateChatTitle({ chatId, messageId: userMessage.id }))
          .pipe(Effect.orDie)
      }

      return {
        userMessage: { message: userMessage, attachments: bound },
        assistantMessage: { message: assistantMessage, attachments: [] },
      }
    }, transaction.run)

    return { send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([ChatService.layer, AttachmentService.layer]),
  )
}
