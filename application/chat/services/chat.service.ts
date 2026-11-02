import { Array as Arr, Context, Crypto, DateTime, Effect, Layer, Struct, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { UserId } from '@app-template/application/identity'
import { ChatRepository, FileRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { ChatId } from '#chat/domain/chat.id'
import { buildChat, type Chat, type ChatTitle, renameChat } from '#chat/domain/chat.model'
import { decodeChat, decodeChats, encodeChat, encodeChatWhere } from '#chat/services/chat.mapper'

/** The row found by `id`; every other field named must still hold, so an owner mismatch reads as absent. */
export type ChatWhere = Types.Simplify<Pick<Chat, 'id'> & Partial<Pick<Chat, 'userId' | 'title'>>>

/** The chat a rename finds: by its owner, or only while it is still untitled. */
export type ChatRenameWhere = Types.Simplify<
  Pick<Chat, 'id'> & RequireAtLeastOne<Pick<Chat, 'userId' | 'title'>>
>

/** The user's chat a delete finds. */
export type ChatDeleteWhere = Types.Simplify<Pick<Chat, 'id' | 'userId'>>

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
    /** Removes the user's chat with its messages, their attachments and the bytes. */
    readonly delete: (where: ChatDeleteWhere) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/application/chat/services/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const files = yield* FileRepository
    const crypto = yield* Crypto.Crypto

    const create = Effect.fn('ChatService.create')(function* (userId: UserId) {
      const id = yield* generateId(crypto, ChatId.make)
      const createdAt = yield* DateTime.now
      const chat = buildChat({ id, userId, createdAt })
      const row = yield* encodeChat(chat)

      yield* chats.insert(row)
      return chat
    })

    const list = Effect.fn('ChatService.list')((userId: UserId) =>
      chats.selectMany({ userId }).pipe(Effect.flatMap(decodeChats)),
    )

    const getOne = Effect.fn('ChatService.getOne')((where: ChatWhere) =>
      chats
        .selectOne(encodeChatWhere(where))
        .pipe(
          Effect.flatMap(decodeChat),
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
      const row = yield* encodeChat(renamed)

      // Only the renamed fields, under the `where` again: a change landing after the read is kept.
      yield* chats.update(Struct.pick(row, ['title', 'updatedAt']), encodeChatWhere(where))
      return renamed
    })

    const remove = Effect.fn('ChatService.delete')(function* (where: ChatDeleteWhere) {
      const chat = yield* getOne(where)

      // The cascade takes the messages and their attachments; the bytes go by the ids read.
      yield* chats.delete({ id: chat.id })
      yield* files.delete({ id: Arr.map(chat.attachments, Struct.get('id')) })
    })

    return { create, list, getOne, rename, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
