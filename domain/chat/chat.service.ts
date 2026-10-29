import { Context, Crypto, Data, DateTime, Effect, Layer, Option, Predicate } from 'effect'

import { type ChatBusyError, ChatNotFoundError, ChatTitledError } from '#domain/chat/chat.error'
import { ChatId } from '#domain/chat/chat.id'
import {
  buildChat,
  Chat,
  type ChatDetail,
  type ChatSummary,
  type ChatTitle,
} from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import type { MessageInputInvalidError } from '#domain/chat/message.error'
import {
  ensureChatAcceptsMessage,
  ensureMessageInput,
  type MessageInput,
} from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import type { UserId } from '#domain/user/user.id'

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
    readonly findSendable: (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) => Effect.Effect<SendableChat, MessageInputInvalidError | ChatNotFoundError | ChatBusyError>
  }
>()('@app-template/domain/chat/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    const crypto = yield* Crypto.Crypto
    const randomChatId = crypto.randomUUIDv7().pipe(Effect.orDie, Effect.map(ChatId.make))

    const findOwnedChat = (userId: UserId, id: ChatId) =>
      chats
        .selectOne({ id, userId })
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id }))))

    const create = Effect.fn('ChatService.create')(function* (userId: UserId) {
      const id = yield* randomChatId
      const createdAt = yield* DateTime.now
      const chat = buildChat({ id, userId, createdAt })

      yield* chats.insert(chat)
      return chat
    })

    const list = Effect.fn('ChatService.list')(chats.selectSummaries)

    const get = Effect.fn('ChatService.get')((userId: UserId, chatId: ChatId) =>
      chats
        .selectDetail({ id: chatId, userId })
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: chatId })))),
    )

    const rename = Effect.fn('ChatService.rename')(function* (
      userId: UserId,
      chatId: ChatId,
      title: ChatTitle,
    ) {
      const chat = yield* findOwnedChat(userId, chatId)
      const updatedAt = yield* DateTime.now
      const renamed = new Chat({ ...chat, title: Option.some(title), updatedAt })

      yield* chats
        .update({ title: renamed.title, updatedAt }, { id: chatId })
        .pipe(Effect.filterOrFail(Predicate.isTruthy, () => new ChatNotFoundError({ id: chatId })))

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
      const found = yield* chats.selectOne({ id: chatId })
      return yield* Option.match(found, {
        onNone: () => new ChatNotFoundError({ id: chatId }),
        onSome: () => new ChatTitledError({ id: chatId }),
      })
    })

    const remove = Effect.fn('ChatService.delete')((userId: UserId, chatId: ChatId) =>
      findOwnedChat(userId, chatId).pipe(Effect.flatMap(() => chats.delete(chatId))),
    )

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

    return {
      create,
      list,
      get,
      rename,
      updateTitle,
      delete: remove,
      findSendable,
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
