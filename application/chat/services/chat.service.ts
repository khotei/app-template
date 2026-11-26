import { Context, Effect, Layer, Struct, type Types } from 'effect'
import type { RequireAtLeastOne, SetOptional, SetRequired } from 'type-fest'

import type { UserId } from '@app-template/application/user'
import { ChatRepository, encodeWhere } from '@app-template/kernel/data'
import { RowCodec } from '@app-template/packages/schema'

import { Chat, ChatNotFoundError } from '#chat/domain/chat.model'

/**
 * A chat by id, narrowed by its owner or by the title it must still hold, none for untitled. A
 * call on a user's behalf requires the owner, so none reaches another's.
 */
export type ChatWhere = Types.Simplify<
  SetOptional<Pick<Chat, 'id' | 'userId' | 'title'>, 'userId' | 'title'>
>

/** The fields an update may set: a user's rename the title, a reply the usage. */
export type ChatUpdate = Types.Simplify<RequireAtLeastOne<Pick<Chat, 'title' | 'usage'>>>

export class ChatService extends Context.Service<
  ChatService,
  {
    readonly create: (userId: UserId) => Effect.Effect<Chat>
    /** The user's chats, the newest created first. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<Chat>>
    /** The chat of the user `where` names; another's is not found. */
    readonly getOne: (
      where: Types.Simplify<SetRequired<ChatWhere, 'userId'>>,
    ) => Effect.Effect<Chat, ChatNotFoundError>
    /** Sets `fields` alone on the chat `where` finds and moves its `updatedAt`. */
    readonly update: (
      fields: ChatUpdate,
      where: ChatWhere,
    ) => Effect.Effect<Chat, ChatNotFoundError>
    /** Removes the chat of the user `where` names, with its messages and Runs; another's is not found. */
    readonly delete: (
      where: Types.Simplify<SetRequired<ChatWhere, 'userId'>>,
    ) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/application/chat/services/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository

    const create = Effect.fn('ChatService.create')(function* (userId: UserId) {
      const { set, row } = yield* RowCodec.makeInsert(Chat)({ userId })

      yield* chats.insert(row)
      return new Chat(set)
    })

    const list = Effect.fn('ChatService.list')(
      (userId: UserId) => chats.selectMany(encodeWhere({ userId })),
      Effect.flatMap(RowCodec.decodeMany(Chat)),
    )

    const getOne = Effect.fn('ChatService.getOne')(
      (where: ChatWhere) => chats.selectOne(encodeWhere(where)),
      Effect.flatMap(RowCodec.decodeOne(Chat)),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new ChatNotFoundError({ id: where.id })),
        ),
    )

    const update = Effect.fn('ChatService.update')(function* (
      fields: ChatUpdate,
      where: ChatWhere,
    ) {
      const chat = yield* getOne(where)
      const { set, row } = yield* RowCodec.makeUpdate(Chat)({
        ...Struct.pick(chat, ['id', 'title', 'usage']),
        ...fields,
      })

      // Only the columns `fields` names, under the `where` again: a rename leaves the usage a
      // reply wrote since the read, and a reply the title.
      yield* chats.update(
        Struct.pick(row, ['id', 'updatedAt', ...Struct.keys(fields)]),
        encodeWhere(where),
      )
      return new Chat({ ...chat, ...set })
    })

    const remove = Effect.fn('ChatService.delete')(function* (
      where: Types.Simplify<SetRequired<ChatWhere, 'userId'>>,
    ) {
      yield* getOne(where)

      // Under the owner again; the cascade takes the messages and the Runs, by their key to the chat.
      yield* chats.delete(encodeWhere(where))
    })

    return { create, list, getOne, update, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
