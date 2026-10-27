import { Context, Crypto, Data, DateTime, Effect, Layer, Option } from 'effect'

import {
  buildAssistantMessage,
  buildChat,
  buildUserMessage,
  Chat,
  ChatBusyError,
  type ChatDetail,
  ChatId,
  ChatNotFoundError,
  ChatRepository,
  type ChatSummary,
  type ChatTitle,
  ChatTitledError,
  ensureChatAcceptsMessage,
  ensureMessageInput,
  isInChat,
  type Message,
  type MessageDetail,
  MessageId,
  type MessageInput,
  type MessageInputInvalidError,
  MessageNotFoundError,
  MessageRepository,
  type MessageWhere,
} from '@app-template/domain/chat'
import { ensureFound } from '@app-template/domain/shared'
import { isOwnedBy, type UserId } from '@app-template/domain/user'

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
     * A step of `DeleteChatUseCase`, which removes their attachments first, since a bound
     * attachment holds its message back from the cascade: entry points call the use case, never
     * this.
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
    /**
     * Stores a settled reply while the stored one still matches `where`, then moves the chat's
     * `updatedAt` alone to the reply's; answers whether it wrote.
     */
    readonly settleReply: (settled: Message, where: MessageWhere) => Effect.Effect<boolean>
  }
>()('@app-template/application/chat/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
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

    const list = Effect.fn('ChatService.list')(chats.selectSummaries)

    const get = Effect.fn('ChatService.get')(function* (userId: UserId, chatId: ChatId) {
      const found = yield* chats.selectDetail(chatId)
      return yield* ensureFound(
        found,
        (detail) => isOwnedBy(userId)(detail.chat),
        () => new ChatNotFoundError({ id: chatId }),
      )
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

      const found = yield* messages.selectDetail(messageId)
      return yield* ensureFound(
        found,
        (detail) => isInChat(chatId)(detail.message),
        () => new MessageNotFoundError({ id: messageId }),
      )
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

      const opened = yield* messages.existsByChat(chatId)
      const at = yield* DateTime.now
      return new SendableChat({ chatId, input, opensChat: !opened, at })
    })

    const addUserMessage = Effect.fn('ChatService.addUserMessage')(function* (
      sendable: SendableChat,
    ) {
      const id = yield* randomMessageId
      const message = buildUserMessage({
        id,
        chatId: sendable.chatId,
        text: sendable.input.text,
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

    const settleReply = Effect.fn('ChatService.settleReply')(function* (
      settled: Message,
      where: MessageWhere,
    ) {
      const written = yield* messages.update(settled, where)
      if (!written) return false

      yield* chats.update({ updatedAt: settled.updatedAt }, { id: settled.chatId })
      return true
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
      settleReply,
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
