import { Context, Crypto, DateTime, Effect, Layer, Option } from 'effect'

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
  type ChatNotFoundError,
  ChatRepository,
  ChatService,
  ensureMessageInput,
  Message,
  MessageId,
  type MessageInput,
  type MessageInputInvalidError,
  MessageRepository,
  queueChat,
} from '@app-template/domain/chat'
import { generateId } from '@app-template/domain/shared'
import type { UserId } from '@app-template/domain/user'
import {
  assistantMessageQueue,
  CurrentReplyProvenance,
  chatTitleQueue,
  GenerateAssistantMessage,
  GenerateChatTitle,
} from '@app-template/infrastructure/chat'
import { Transaction } from '@app-template/infrastructure/db'
import { QueueSender } from '@app-template/queue'

export interface SentMessages {
  readonly userMessage: Message
  readonly assistantMessage: Message
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
    const queue = yield* QueueSender
    const transaction = yield* Transaction
    const crypto = yield* Crypto.Crypto
    const provenance = yield* CurrentReplyProvenance

    const send = Effect.fn('SendMessageUseCase.send')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const chat = yield* chatService.getOne({ id: chatId, userId })
      yield* ensureMessageInput(input)
      const queued = yield* queueChat(chat)
      const isFirstMessage = yield* messages.selectOne({ chatId }).pipe(Effect.map(Option.isNone))
      const at = yield* DateTime.now

      // A concurrent send that queued the chat after the read leaves no row where its status
      // holds, so this write dies: a lost race of two sends at once, rolled back whole.
      yield* chats.update({ status: queued.status }, { id: chatId, status: chat.status })

      const userMessageId = yield* generateId(crypto, MessageId.make)
      const userMessage = buildUserMessage({
        id: userMessageId,
        chatId,
        text: input.text,
        createdAt: at,
      })
      yield* messages.insert(userMessage)
      const bound = yield* attachmentService.bind(userId, input.attachmentIds, {
        messageId: userMessage.id,
        chatId,
      })
      const assistantMessageId = yield* generateId(crypto, MessageId.make)
      const assistantMessage = buildAssistantMessage({
        id: assistantMessageId,
        chatId,
        createdAt: at,
      })
      yield* messages.insert(assistantMessage)
      yield* queue.send(
        assistantMessageQueue,
        new GenerateAssistantMessage({ chatId, messageId: assistantMessage.id, provenance }),
      )
      if (isFirstMessage) {
        yield* queue.send(
          chatTitleQueue,
          new GenerateChatTitle({ chatId, messageId: userMessage.id }),
        )
      }

      return {
        userMessage: new Message({ ...userMessage, attachments: bound }),
        assistantMessage,
      }
    }, transaction.run)

    return { send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([ChatService.layer, AttachmentService.layer]),
  )
}
