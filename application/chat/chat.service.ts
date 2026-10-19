import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  RcMap,
  Semaphore,
} from 'effect'

import {
  Attachment,
  type AttachmentBoundError,
  type AttachmentId,
  type AttachmentNotFoundError,
  AttachmentRepository,
  AttachmentStore,
  ensureBindable,
} from '@app-template/domain/attachment'
import {
  buildAssistantMessage,
  buildChat,
  buildUserMessage,
  byLatestUpdate,
  Chat,
  type ChatBusyError,
  ChatId,
  ChatNotFoundError,
  ChatRepository,
  type ChatTitle,
  ensureChatAcceptsMessage,
  ensureMessageInput,
  isInChat,
  type Message,
  MessageId,
  type MessageInput,
  type MessageInputInvalidError,
  MessageNotFoundError,
  MessageRepository,
} from '@app-template/domain/chat'
import { isOwnedBy, type UserId } from '@app-template/domain/user'

import { AssistantMessageJob } from '#application/chat/assistant-message.job'
import { ChatTitleJob } from '#application/chat/chat-title.job'
import { touchChat } from '#application/chat/touch-chat'

export interface MessageDetail {
  readonly message: Message
  /** The metadata of the message's attachments, in the order the message lists them. */
  readonly attachments: ReadonlyArray<Attachment>
}

export interface SentMessages {
  readonly userMessage: MessageDetail
  readonly assistantMessage: MessageDetail
}

export interface ChatSummary {
  readonly chat: Chat
  readonly activeMessage: Option.Option<Message>
}

export interface ChatDetail extends ChatSummary {
  /** Every message of the chat, in creation order. */
  readonly messages: ReadonlyArray<MessageDetail>
}

export class ChatService extends Context.Service<
  ChatService,
  {
    readonly create: (userId: UserId) => Effect.Effect<Chat>
    /** Returns the user's chats, the most recently updated first. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<ChatSummary>>
    readonly get: (userId: UserId, chatId: ChatId) => Effect.Effect<ChatDetail, ChatNotFoundError>
    readonly rename: (
      userId: UserId,
      chatId: ChatId,
      title: ChatTitle,
    ) => Effect.Effect<Chat, ChatNotFoundError>
    /** Removes the chat with its messages and their attachments, whether or not a reply runs. */
    readonly delete: (userId: UserId, chatId: ChatId) => Effect.Effect<void, ChatNotFoundError>
    readonly getMessage: (
      userId: UserId,
      chatId: ChatId,
      messageId: MessageId,
    ) => Effect.Effect<MessageDetail, ChatNotFoundError | MessageNotFoundError>
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
>()('@app-template/application/chat/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    const attachments = yield* AttachmentRepository
    const attachmentStore = yield* AttachmentStore
    const crypto = yield* Crypto.Crypto
    const assistantJob = yield* AssistantMessageJob
    const titleJob = yield* ChatTitleJob
    const userLocks = yield* RcMap.make({ lookup: (_: UserId) => Semaphore.make(1) })
    const randomId = Effect.orDie(crypto.randomUUIDv7())

    // Makes a user's check-then-write one critical section: two sends cannot both find no active
    // message, nor bind one attachment in two chats. Per user, not per chat: a chat lock leaves the
    // cross-chat bind open. It spans this process only; a second api process needs the store's
    // guards (one active message per chat, a bind only while unbound).
    const lockUser = <A, E, R>(effect: Effect.Effect<A, E, R>, userId: UserId) =>
      RcMap.get(userLocks, userId).pipe(
        Effect.flatMap((lock) => lock.withPermit(effect)),
        Effect.scoped,
      )

    const findOwnedChat = Effect.fnUntraced(function* (userId: UserId, id: ChatId) {
      const owned = Option.filter(yield* chats.selectById(id), isOwnedBy(userId))
      if (Option.isNone(owned)) return yield* new ChatNotFoundError({ id })
      return owned.value
    })

    const findBindable = (userId: UserId, id: AttachmentId) =>
      Effect.flatMap(attachments.selectById(id), (found) => ensureBindable(id, found, userId))

    const create = Effect.fn('ChatService.create')(function* (userId: UserId) {
      const id = ChatId.make(yield* randomId)
      const chat = buildChat({ id, userId, createdAt: yield* DateTime.now })
      yield* chats.insert(chat)
      return chat
    })

    const summarize = (chat: Chat): Effect.Effect<ChatSummary> =>
      Effect.map(messages.selectActiveByChat(chat.id), (activeMessage) => ({ chat, activeMessage }))

    const withAttachments = (message: Message): Effect.Effect<MessageDetail> =>
      Effect.map(attachments.selectByIds(message.attachmentIds), (found) => ({
        message,
        attachments: found,
      }))

    const list = Effect.fn('ChatService.list')(function* (userId: UserId) {
      const sorted = Arr.sort(yield* chats.selectByUser(userId), byLatestUpdate)
      return yield* Effect.forEach(sorted, summarize)
    })

    const get = Effect.fn('ChatService.get')(function* (userId: UserId, chatId: ChatId) {
      const summary = yield* summarize(yield* findOwnedChat(userId, chatId))
      const stored = yield* messages.selectByChat(chatId)
      return { ...summary, messages: yield* Effect.forEach(stored, withAttachments) }
    })

    const rename = Effect.fn('ChatService.rename')(function* (
      userId: UserId,
      chatId: ChatId,
      title: ChatTitle,
    ) {
      const chat = yield* findOwnedChat(userId, chatId)
      const renamed = new Chat({
        ...chat,
        title: Option.some(title),
        updatedAt: yield* DateTime.now,
      })
      yield* chats.update(renamed)
      return renamed
    }, lockUser)

    // Each step leaves what the next one reads, so a retry after a crash finishes the cascade; the
    // messages go before the chat, so the title job reads a missing first message as a delete.
    const remove = Effect.fn('ChatService.delete')(function* (userId: UserId, chatId: ChatId) {
      yield* findOwnedChat(userId, chatId)
      const attachmentIds = Arr.flatMap(
        yield* messages.selectByChat(chatId),
        (message) => message.attachmentIds,
      )
      yield* attachments.deleteByIds(attachmentIds)
      yield* Effect.forEach(attachmentIds, attachmentStore.delete, { discard: true })
      yield* messages.deleteByChat(chatId)
      yield* chats.delete(chatId)
    }, lockUser)

    const getMessage = Effect.fn('ChatService.getMessage')(function* (
      userId: UserId,
      chatId: ChatId,
      messageId: MessageId,
    ) {
      yield* findOwnedChat(userId, chatId)
      const found = Option.filter(yield* messages.selectById(messageId), isInChat(chatId))
      if (Option.isNone(found)) return yield* new MessageNotFoundError({ id: messageId })
      return yield* withAttachments(found.value)
    })

    const send = Effect.fn('ChatService.send')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      yield* ensureMessageInput(input)
      yield* findOwnedChat(userId, chatId)
      yield* ensureChatAcceptsMessage(yield* messages.selectActiveByChat(chatId))
      const bindable = yield* Effect.forEach(input.attachmentIds, (id) => findBindable(userId, id))
      const opensChat = Arr.isReadonlyArrayEmpty(yield* messages.selectByChat(chatId))
      const createdAt = yield* DateTime.now
      const userMessage = buildUserMessage({
        id: MessageId.make(yield* randomId),
        chatId,
        text: input.text,
        attachmentIds: input.attachmentIds,
        createdAt,
      })
      const assistantMessage = buildAssistantMessage({
        id: MessageId.make(yield* randomId),
        chatId,
        createdAt,
      })
      const bound = Arr.map(
        bindable,
        (attachment) => new Attachment({ ...attachment, messageId: Option.some(userMessage.id) }),
      )
      yield* messages.insert(userMessage)
      yield* Effect.forEach(bound, attachments.update, { discard: true })
      yield* messages.insert(assistantMessage)
      yield* touchChat(chatId, createdAt).pipe(Effect.provideService(ChatRepository, chats))
      yield* assistantJob.enqueue(assistantMessage)
      if (opensChat) yield* titleJob.enqueue(userMessage)
      return {
        userMessage: { message: userMessage, attachments: bound },
        assistantMessage: { message: assistantMessage, attachments: [] },
      }
    }, lockUser)

    return { create, list, get, rename, delete: remove, getMessage, send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([AssistantMessageJob.layer, ChatTitleJob.layer]),
  )
}
