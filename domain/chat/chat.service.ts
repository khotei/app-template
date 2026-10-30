import { Array as Arr, Context, Data, DateTime, Effect, Layer, Option, Struct } from 'effect'

import { type ChatBusyError, ChatNotFoundError } from '#domain/chat/chat.error'
import type { ChatId } from '#domain/chat/chat.id'
import { Chat, type ChatWithStatus, withStatus } from '#domain/chat/chat.model'
import { ChatRepository, type ChatSet, type ChatWhere } from '#domain/chat/chat.port'
import type { MessageInputInvalidError } from '#domain/chat/message.error'
import {
  activeMessageWhere,
  ensureChatAcceptsMessage,
  ensureMessageInput,
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
    readonly getOne: (where: ChatWhere) => Effect.Effect<ChatWithStatus, ChatNotFoundError>
    /** Writes `set` to the chat `where` finds; the caller decides the title and whether `updatedAt` moves. */
    readonly rename: (where: ChatWhere, set: ChatSet) => Effect.Effect<Chat, ChatNotFoundError>
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

    const getOne = Effect.fn('ChatService.getOne')(function* (where: ChatWhere) {
      const chat = yield* chats
        .selectOne(where)
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: where.id }))))
      const active = yield* messages.selectMany({ chatId: [chat.id], ...activeMessageWhere })

      return withStatus(chat, Arr.head(active).pipe(Option.map(Struct.get('message'))))
    })

    const rename = Effect.fn('ChatService.rename')(function* (where: ChatWhere, set: ChatSet) {
      const chat = yield* chats
        .selectOne(where)
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: where.id }))))

      // The `where` holds again in the write, so a change landing after the read is kept.
      yield* chats.update(set, where)
      return new Chat({ ...chat, ...set })
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

      const active = yield* messages.selectMany({ chatId: [chatId], ...activeMessageWhere })
      yield* ensureChatAcceptsMessage(Arr.head(active).pipe(Option.map(Struct.get('message'))))

      const first = yield* messages.selectOne({ chatId })
      const at = yield* DateTime.now
      return new SendableChat({ chatId, input, opensChat: Option.isNone(first), at })
    })

    return { getOne, rename, findSendable }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
