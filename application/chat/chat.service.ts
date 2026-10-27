import { Array as Arr, Context, Crypto, Data, DateTime, Effect, Layer, Option } from 'effect'

import { type Attachment, AttachmentRepository } from '@app-template/domain/attachment'
import {
  type ActiveMessage,
  buildAssistantMessage,
  buildChat,
  buildUserMessage,
  byLatestUpdate,
  Chat,
  ChatBusyError,
  ChatId,
  ChatNotFoundError,
  ChatRepository,
  type ChatTitle,
  ChatTitledError,
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
import { ensureFound } from '@app-template/domain/shared'
import { isOwnedBy, type UserId } from '@app-template/domain/user'

export interface MessageDetail {
  readonly message: Message
  /** The metadata of the message's attachments, in the order the message lists them. */
  readonly attachments: ReadonlyArray<Attachment>
}

export interface ChatSummary {
  readonly chat: Chat
  readonly activeMessage: Option.Option<ActiveMessage>
}

export interface ChatDetail extends ChatSummary {
  /** Every message of the chat, in creation order. */
  readonly messages: ReadonlyArray<MessageDetail>
}

/**
 * Proof that a send may write to this chat: only `ChatService.findSendable` builds one, after it
 * checked the input, the owner and that no message in the chat is active.
 */
class SendableChat extends Data.Class<{
  readonly chatId: ChatId
  readonly input: MessageInput
  /** The chat has no message yet, so this send opens it. */
  readonly opensChat: boolean
  /** When the send was accepted: the messages' `createdAt` and the chat's `updatedAt`. */
  readonly at: DateTime.Utc
}> {
  declare private readonly proof: never
}

export type { SendableChat }

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
    /** Titles a chat no one has titled yet, keeping its `updatedAt`. */
    readonly updateTitle: (
      chatId: ChatId,
      title: ChatTitle,
    ) => Effect.Effect<void, ChatNotFoundError | ChatTitledError>
    /**
     * Removes the chat with its messages, whether or not a reply runs.
     *
     * A step of `DeleteChatUseCase`, which removes their attachments first, while the messages
     * still list them: entry points call the use case, never this.
     */
    readonly delete: (userId: UserId, chatId: ChatId) => Effect.Effect<void, ChatNotFoundError>
    readonly getMessage: (
      userId: UserId,
      chatId: ChatId,
      messageId: MessageId,
    ) => Effect.Effect<MessageDetail, ChatNotFoundError | MessageNotFoundError>
    readonly findSendable: (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) => Effect.Effect<SendableChat, MessageInputInvalidError | ChatNotFoundError | ChatBusyError>
    /**
     * Moves the chat's `updatedAt` alone to the send's time, then stores the message; a chat
     * deleted since the check is `ChatNotFoundError`.
     */
    readonly addUserMessage: (sendable: SendableChat) => Effect.Effect<Message, ChatNotFoundError>
    readonly addAssistantMessage: (sendable: SendableChat) => Effect.Effect<Message, ChatBusyError>
  }
>()('@app-template/application/chat/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    const attachments = yield* AttachmentRepository
    const crypto = yield* Crypto.Crypto
    const randomUuid = Effect.orDie(crypto.randomUUIDv7())
    const randomChatId = Effect.map(randomUuid, ChatId.make)
    const randomMessageId = Effect.map(randomUuid, MessageId.make)

    const findOwnedChat = Effect.fnUntraced(function* (userId: UserId, id: ChatId) {
      const found = yield* chats.selectById(id)
      return yield* ensureFound(found, isOwnedBy(userId), () => new ChatNotFoundError({ id }))
    })

    const create = Effect.fn('ChatService.create')(function* (userId: UserId) {
      const id = yield* randomChatId
      const createdAt = yield* DateTime.now
      const chat = buildChat({ id, userId, createdAt })

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
      const stored = yield* chats.selectByUser(userId)
      const sorted = Arr.sort(stored, byLatestUpdate)
      return yield* Effect.forEach(sorted, summarize)
    })

    const get = Effect.fn('ChatService.get')(function* (userId: UserId, chatId: ChatId) {
      const chat = yield* findOwnedChat(userId, chatId)
      const summary = yield* summarize(chat)

      const stored = yield* messages.selectByChat(chatId)
      const detailed = yield* Effect.forEach(stored, withAttachments)
      return { ...summary, messages: detailed }
    })

    const rename = Effect.fn('ChatService.rename')(function* (
      userId: UserId,
      chatId: ChatId,
      title: ChatTitle,
    ) {
      const chat = yield* findOwnedChat(userId, chatId)
      const updatedAt = yield* DateTime.now
      const renamed = new Chat({ ...chat, title: Option.some(title), updatedAt })

      const written = yield* chats.update({ title: renamed.title, updatedAt }, { id: chatId })
      if (!written) return yield* new ChatNotFoundError({ id: chatId })
      return renamed
    })

    const updateTitle = Effect.fn('ChatService.updateTitle')(function* (
      chatId: ChatId,
      title: ChatTitle,
    ) {
      const written = yield* chats.update(
        { title: Option.some(title) },
        { id: chatId, title: Option.none() },
      )
      if (written) return

      // Read only to name the refusal: the write above already decided it.
      const found = yield* chats.selectById(chatId)
      return yield* Option.match(found, {
        onNone: () => new ChatNotFoundError({ id: chatId }),
        onSome: () => new ChatTitledError({ id: chatId }),
      })
    })

    const remove = Effect.fn('ChatService.delete')(function* (userId: UserId, chatId: ChatId) {
      yield* findOwnedChat(userId, chatId)
      yield* chats.delete(chatId)
    })

    const getMessage = Effect.fn('ChatService.getMessage')(function* (
      userId: UserId,
      chatId: ChatId,
      messageId: MessageId,
    ) {
      yield* findOwnedChat(userId, chatId)

      const found = yield* messages.selectById(messageId)
      const message = yield* ensureFound(
        found,
        isInChat(chatId),
        () => new MessageNotFoundError({ id: messageId }),
      )

      return yield* withAttachments(message)
    })

    const findSendable = Effect.fn('ChatService.findSendable')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      yield* ensureMessageInput(input)
      yield* findOwnedChat(userId, chatId)

      const active = yield* messages.selectActiveByChat(chatId)
      yield* ensureChatAcceptsMessage(active)

      const stored = yield* messages.selectByChat(chatId)
      const at = yield* DateTime.now
      return new SendableChat({ chatId, input, opensChat: Arr.isReadonlyArrayEmpty(stored), at })
    })

    const addUserMessage = Effect.fn('ChatService.addUserMessage')(function* (
      sendable: SendableChat,
    ) {
      const id = yield* randomMessageId
      const message = buildUserMessage({
        id,
        chatId: sendable.chatId,
        text: sendable.input.text,
        attachmentIds: sendable.input.attachmentIds,
        createdAt: sendable.at,
      })

      const written = yield* chats.update({ updatedAt: sendable.at }, { id: sendable.chatId })
      if (!written) return yield* new ChatNotFoundError({ id: sendable.chatId })

      yield* messages.insert(message)
      return message
    })

    const addAssistantMessage = Effect.fn('ChatService.addAssistantMessage')(function* (
      sendable: SendableChat,
    ) {
      const id = yield* randomMessageId
      const message = buildAssistantMessage({
        id,
        chatId: sendable.chatId,
        createdAt: sendable.at,
      })

      const inserted = yield* messages.insert(message)
      if (!inserted) return yield* new ChatBusyError({ id: sendable.chatId })
      return message
    })

    return {
      create,
      list,
      get,
      rename,
      updateTitle,
      delete: remove,
      getMessage,
      findSendable,
      addUserMessage,
      addAssistantMessage,
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
