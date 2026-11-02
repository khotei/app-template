import { Array as Arr, Context, Crypto, DateTime, Effect, Layer, Option, Struct } from 'effect'

import {
  type AttachmentBoundError,
  type AttachmentNotFoundError,
  AttachmentService,
  assistantMessageQueue,
  bindAttachment,
  buildAssistantMessage,
  buildUserMessage,
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  CurrentReplyProvenance,
  chatTitleQueue,
  encodeMessage,
  ensureMessageInput,
  GenerateAssistantMessage,
  GenerateChatTitle,
  Message,
  MessageId,
  type MessageInput,
  type MessageInputInvalidError,
  queueChat,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import {
  AttachmentRepository,
  ChatRepository,
  FileRepository,
  MessageRepository,
} from '@app-template/kernel/data'
import { generateId, Transaction } from '@app-template/packages/db'
import { QueueSender } from '@app-template/packages/queue'

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
>()('@app-template/application/use-cases/chat/SendMessageUseCase', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const attachments = yield* AttachmentRepository
    const files = yield* FileRepository
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
      const requested = yield* attachmentService.getMany({ id: input.attachmentIds, userId })
      const isFirstMessage = yield* messages.selectOne({ chatId }).pipe(Effect.map(Option.isNone))
      const at = yield* DateTime.now
      const userMessageId = yield* generateId(crypto, MessageId.make)
      const userMessage = buildUserMessage({
        id: userMessageId,
        chatId,
        text: input.text,
        createdAt: at,
      })
      const bound = yield* Effect.forEach(requested, (attachment) =>
        bindAttachment(attachment, userMessage),
      )

      // A concurrent send that queued the chat after the read leaves no row where its status
      // holds, so this write dies: a lost race of two sends at once, rolled back whole.
      yield* chats.update({ status: queued.status }, { id: chatId, status: chat.status })
      yield* encodeMessage(userMessage).pipe(Effect.flatMap(messages.insert))
      // The bind follows the insert, since its key to the message is not deferrable; a send
      // without files skips it, as the update would die on no rows.
      if (Arr.isReadonlyArrayNonEmpty(bound)) {
        const ids = Arr.map(bound, Struct.get('id'))
        // The files first: unbound bytes expire, so a crash must never leave a bound row over them.
        yield* Effect.forEach(ids, (id) => files.update({ bound: true }, { id }), {
          concurrency: 'unbounded',
          discard: true,
        })
        // `messageId: null` is the race's guard: a send that bound any of them since the read
        // leaves this write short of a row it names, so it dies and the send rolls back whole.
        yield* attachments.update(
          { messageId: userMessage.id, chatId },
          { id: ids, userId, messageId: null },
        )
      }
      const assistantMessageId = yield* generateId(crypto, MessageId.make)
      const assistantMessage = buildAssistantMessage({
        id: assistantMessageId,
        chatId,
        createdAt: at,
      })
      yield* encodeMessage(assistantMessage).pipe(Effect.flatMap(messages.insert))
      yield* queue.send(
        assistantMessageQueue,
        new GenerateAssistantMessage({
          chatId,
          messageId: assistantMessage.id,
          provenance: Option.some(provenance),
        }),
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
