import {
  Array as Arr,
  Context,
  Data,
  DateTime,
  Effect,
  flow,
  Layer,
  Option,
  pipe,
  Struct,
} from 'effect'

import { type ChatBusyError, ChatNotFoundError, ChatTitledError } from '#domain/chat/chat.error'
import type { ChatId, MessageId } from '#domain/chat/chat.id'
import { Chat, type ChatDetail, type ChatSummary, type ChatTitle } from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import { type MessageInputInvalidError, MessageNotFoundError } from '#domain/chat/message.error'
import {
  activeMessageWhere,
  ensureChatAcceptsMessage,
  ensureMessageInput,
  isActiveMessage,
  type MessageDetail,
  type MessageInput,
} from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import type { UserId } from '#domain/user/user.id'

/** A send `ChatService.findSendable` accepted: its checked input and what it writes with. */
export class SendableChat extends Data.Class<{
  readonly chatId: ChatId
  readonly input: MessageInput
  /** The chat has no message yet, so this send opens it. */
  readonly opensChat: boolean
  /** When the send was accepted: the messages' `createdAt` and the chat's `updatedAt`. */
  readonly at: DateTime.Utc
}> {}

export class ChatService extends Context.Service<
  ChatService,
  {
    /** Returns the user's chats, the most recently updated first. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<ChatSummary>>
    readonly get: (userId: UserId, chatId: ChatId) => Effect.Effect<ChatDetail, ChatNotFoundError>
    readonly getMessage: (
      userId: UserId,
      chatId: ChatId,
      messageId: MessageId,
    ) => Effect.Effect<MessageDetail, MessageNotFoundError>
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
     * Checks a send and holds the chat's row until the transaction ends, so a concurrent send to
     * the chat waits for this one and then finds its reply active.
     */
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

    const selectActive = (chatIds: ReadonlyArray<ChatId>) =>
      messages
        .selectMany({ chatId: chatIds, ...activeMessageWhere })
        .pipe(Effect.map(flow(Arr.map(Struct.get('message')), Arr.filter(isActiveMessage))))

    const list = Effect.fn('ChatService.list')(function* (userId: UserId) {
      const found = yield* chats.selectByUser(userId)
      const active = yield* selectActive(Arr.map(found, Struct.get('id')))

      return Arr.map(
        found,
        (chat): ChatSummary => ({
          chat,
          activeMessage: Arr.findFirst(active, (message) => message.chatId === chat.id),
        }),
      )
    })

    const get = Effect.fn('ChatService.get')(function* (userId: UserId, chatId: ChatId) {
      const chat = yield* chats
        .selectOne({ id: chatId, userId })
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: chatId }))))
      const details = yield* messages.selectMany({ chatId: [chatId] })

      const activeMessage = pipe(
        details,
        Arr.map(Struct.get('message')),
        Arr.findFirst(isActiveMessage),
      )
      return { chat, activeMessage, messages: details }
    })

    const getMessage = Effect.fn('ChatService.getMessage')(
      (userId: UserId, chatId: ChatId, messageId: MessageId) =>
        messages
          .selectOne({ id: messageId, chatId, userId })
          .pipe(
            Effect.flatMap(Effect.fromOption(() => new MessageNotFoundError({ id: messageId }))),
          ),
    )

    const rename = Effect.fn('ChatService.rename')(function* (
      userId: UserId,
      chatId: ChatId,
      title: ChatTitle,
    ) {
      const chat = yield* chats
        .selectOne({ id: chatId, userId })
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: chatId }))))
      const updatedAt = yield* DateTime.now
      const renamed = new Chat({ ...chat, title: Option.some(title), updatedAt })

      yield* chats.update({ title: renamed.title, updatedAt }, { id: chatId })
      return renamed
    })

    const updateTitle = Effect.fn('ChatService.updateTitle')(function* (
      chatId: ChatId,
      title: ChatTitle,
    ) {
      const chat = yield* chats
        .selectOne({ id: chatId })
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: chatId }))))
      if (Option.isSome(chat.title)) return yield* new ChatTitledError({ id: chatId })

      // The `where` keeps a rename that lands after the read.
      yield* chats.update({ title: Option.some(title) }, { id: chatId, title: Option.none() })
    })

    const findSendable = Effect.fn('ChatService.findSendable')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      yield* ensureMessageInput(input)
      yield* chats
        .selectOne({ id: chatId, userId }, { forUpdate: true })
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: chatId }))))

      const active = yield* selectActive([chatId])
      yield* ensureChatAcceptsMessage(Arr.head(active))

      const first = yield* messages.selectOne({ chatId })
      const at = yield* DateTime.now
      return new SendableChat({ chatId, input, opensChat: Option.isNone(first), at })
    })

    return { list, get, getMessage, rename, updateTitle, findSendable }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
