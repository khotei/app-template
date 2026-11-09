import {
  Array as Arr,
  Cause,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  pipe,
  Struct,
} from 'effect'

import {
  type AttachmentBoundError,
  AttachmentId,
  type AttachmentNotFoundError,
  assistantMessageQueue,
  bindAttachment,
  buildAssistantMessage,
  buildUserMessage,
  type Chat,
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  CurrentReplyProvenance,
  chatTitleQueue,
  encodeMessage,
  ensureAllStored,
  ensureMessageInput,
  failChat,
  failMessage,
  GenerateAssistantMessage,
  GenerateChatTitle,
  LiveAttachmentService,
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
import { type QueueError, QueueSender } from '@app-template/packages/queue'

export interface CreatedMessages {
  readonly userMessage: Message
  readonly assistantMessage: Message
}

export class CreateUserMessageUseCase extends Context.Service<
  CreateUserMessageUseCase,
  {
    /**
     * Stores the user's message with a queued reply and binds its attachments, then sends its
     * jobs; a reply SQS refuses is answered failed with its chat.
     */
    readonly create: (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) => Effect.Effect<
      CreatedMessages,
      | MessageInputInvalidError
      | ChatNotFoundError
      | ChatBusyError
      | AttachmentNotFoundError
      | AttachmentBoundError
    >
  }
>()('@app-template/application/use-cases/chat/CreateUserMessageUseCase', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const attachments = yield* AttachmentRepository
    const files = yield* FileRepository
    const chatService = yield* ChatService
    const messages = yield* MessageRepository
    const liveAttachments = yield* LiveAttachmentService
    const queue = yield* QueueSender
    const transaction = yield* Transaction
    const crypto = yield* Crypto.Crypto
    const provenance = yield* CurrentReplyProvenance

    const store = Effect.fnUntraced(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const chat = yield* chatService.getOne({ id: chatId, userId })
      yield* ensureMessageInput(input)
      const queued = yield* queueChat(chat)
      const live = yield* liveAttachments.getMany({ id: input.attachmentIds, userId })
      const storedIds = yield* files
        .selectMany({ id: Arr.map(live, Struct.get('id')) })
        .pipe(Effect.map(Arr.map((file) => AttachmentId.make(file.id))))
      const requested = yield* pipe(live, ensureAllStored(input.attachmentIds, storedIds))
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

      // A concurrent create that queued the chat after the read leaves no row where its status
      // holds, so this write dies: a lost race of two creates at once, rolled back whole.
      yield* chats.update({ status: queued.status }, { id: chatId, status: chat.status })
      yield* encodeMessage(userMessage).pipe(Effect.flatMap(messages.insert))
      // The bind follows the insert, since its key to the message is not deferrable; a create
      // without files skips it, as the update would die on no rows.
      if (Arr.isReadonlyArrayNonEmpty(bound)) {
        const ids = Arr.map(bound, Struct.get('id'))
        // The files first: unbound bytes expire, so a crash must never leave a bound row over them.
        yield* files.update({ bound: true }, { id: ids })
        // `messageId: null` is the race's guard: a create that bound any of them since the read
        // leaves this write short of a row it names, so it dies and the create rolls back whole.
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

      return {
        chat: queued,
        userMessage: new Message({ ...userMessage, attachments: bound }),
        assistantMessage,
        isFirstMessage,
      }
    }, transaction.run)

    // No run will take a reply whose job SQS refused, so it fails with its chat at once.
    const failReply = Effect.fnUntraced(
      function* (chat: Chat, reply: Message, error: QueueError) {
        const failedAt = yield* DateTime.now
        const failed = yield* failMessage(reply, {
          reason: 'ReplyFailed',
          cause: Cause.pretty(Cause.fail(error)),
          at: failedAt,
        })
        const ended = yield* failChat(chat)
        yield* encodeMessage(failed).pipe(
          Effect.flatMap((row) => messages.update(row, { id: reply.id, status: [reply.status] })),
        )
        yield* chats.update({ status: ended.status }, { id: chat.id, status: chat.status })
        return failed
      },
      Effect.orDie,
      transaction.run,
    )

    const create = Effect.fn('CreateUserMessageUseCase.create')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const stored = yield* store(userId, chatId, input)
      const assistantMessage = yield* queue
        .send(
          assistantMessageQueue,
          new GenerateAssistantMessage({
            chatId,
            messageId: stored.assistantMessage.id,
            provenance: Option.some(provenance),
          }),
        )
        .pipe(
          Effect.as(stored.assistantMessage),
          Effect.catchTag('QueueError', (error) =>
            failReply(stored.chat, stored.assistantMessage, error),
          ),
        )
      if (stored.isFirstMessage) {
        yield* queue
          .send(chatTitleQueue, new GenerateChatTitle({ chatId, messageId: stored.userMessage.id }))
          .pipe(
            Effect.catchTag('QueueError', (error) =>
              Effect.logWarning('chat title job refused', error),
            ),
          )
      }

      return { userMessage: stored.userMessage, assistantMessage }
    }, Effect.uninterruptible)

    return { create }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([ChatService.layer, LiveAttachmentService.layer]),
  )
}
