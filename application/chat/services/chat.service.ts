import {
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  Schema,
  Struct,
  type Types,
  UndefinedOr,
} from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { UserId } from '@app-template/application/identity'
import { type ChatEntityWhere, ChatRepository } from '@app-template/kernel/data'
import { decodeRowWith, encodeRowWith, generateId } from '@app-template/packages/db'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { ChatId } from '#chat/domain/chat.id'
import { buildChat, Chat, ChatFields, type ChatTitle, renameChat } from '#chat/domain/chat.model'

/** The user's chat; another user's reads as absent. */
export type ChatWhere = Types.Simplify<Pick<Chat, 'id' | 'userId'>>

/** The chat a rename finds: by its owner, or only while it is still untitled. */
export type ChatRenameWhere = Types.Simplify<
  Pick<Chat, 'id'> & RequireAtLeastOne<Pick<Chat, 'userId' | 'title'>>
>

type ChatReadWhere = Types.Simplify<Pick<Chat, 'id'> & Partial<Pick<Chat, 'userId' | 'title'>>>

const encodeChatWhere = (where: ChatReadWhere): ChatEntityWhere =>
  Struct.evolve(where, { title: UndefinedOr.map(Option.getOrNull) })

export class ChatService extends Context.Service<
  ChatService,
  {
    readonly create: (userId: UserId) => Effect.Effect<Chat>
    /** The user's chats, the newest created first. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<Chat>>
    readonly getOne: (where: ChatWhere) => Effect.Effect<Chat, ChatNotFoundError>
    /** Titles the chat `where` finds and moves its `updatedAt`. */
    readonly rename: (
      where: ChatRenameWhere,
      title: ChatTitle,
    ) => Effect.Effect<Chat, ChatNotFoundError>
    /**
     * Removes the user's chat with its messages and their attachments' records, and answers the
     * chat it removed; the bytes stay, for the caller to delete.
     */
    readonly delete: (where: ChatWhere) => Effect.Effect<Chat, ChatNotFoundError>
  }
>()('@app-template/application/chat/services/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const crypto = yield* Crypto.Crypto

    const create = Effect.fn('ChatService.create')(function* (userId: UserId) {
      const id = yield* generateId(crypto, ChatId.make)
      const createdAt = yield* DateTime.now
      const chat = buildChat({ id, userId, createdAt })
      const row = yield* encodeRowWith(ChatFields)(chat)

      yield* chats.insert(row)
      return chat
    })

    const list = Effect.fn('ChatService.list')((userId: UserId) =>
      chats.selectMany({ userId }).pipe(Effect.flatMap(decodeRowWith(Schema.Array(Chat)))),
    )

    const getOne = Effect.fn('ChatService.getOne')((where: ChatReadWhere) =>
      chats
        .selectOne(encodeChatWhere(where))
        .pipe(
          Effect.flatMap(decodeRowWith(Schema.Option(Chat))),
          Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: where.id }))),
        ),
    )

    const rename = Effect.fn('ChatService.rename')(function* (
      where: ChatRenameWhere,
      title: ChatTitle,
    ) {
      const chat = yield* getOne(where)
      const at = yield* DateTime.now
      const renamed = renameChat(chat, { title, at })
      const row = yield* encodeRowWith(ChatFields)(renamed)

      // Only the renamed fields, under the `where` again: a change landing after the read is kept.
      yield* chats.update(Struct.pick(row, ['title', 'updatedAt']), encodeChatWhere(where))
      return renamed
    })

    const remove = Effect.fn('ChatService.delete')(function* (where: ChatWhere) {
      const chat = yield* getOne(where)

      // The cascade takes the messages and their attachments.
      yield* chats.delete({ id: chat.id })
      return chat
    })

    return { create, list, getOne, rename, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
