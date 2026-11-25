import { Context, Effect, Layer, SchemaIssue, type Types } from 'effect'
import type { SetOptional, SetRequired } from 'type-fest'

import type { UserId } from '@app-template/application/identity'
import { ChatRepository, encodeWhere } from '@app-template/kernel/data'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { Chat } from '#chat/domain/chat.model'

/**
 * A chat by id, narrowed by its owner or by the title it must still hold, none for untitled. A
 * call on a user's behalf requires the owner, so none reaches another's.
 */
export type ChatWhere = Types.Simplify<
  SetOptional<Pick<Chat, 'id' | 'userId' | 'title'>, 'userId' | 'title'>
>

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
    /** Sets `fields` on the chat `where` finds and moves its `updatedAt`. */
    readonly update: (
      fields: typeof Chat.jsonUpdate.Type,
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
      const { set, row } = yield* Chat.makeInsert({ userId })

      yield* chats.insert(row)
      return new Chat(set)
    }, Effect.orDie)

    const list = Effect.fn('ChatService.list')(
      (userId: UserId) => chats.selectMany({ userId }),
      Effect.flatMap(Chat.decodeMany),
    )

    const getOne = Effect.fn('ChatService.getOne')(
      (where: ChatWhere) => chats.selectOne(encodeWhere(where)),
      Effect.flatMap(Chat.decodeOne),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new ChatNotFoundError({ id: where.id })),
        ),
    )

    const update = Effect.fn('ChatService.update')(
      function* (fields: typeof Chat.jsonUpdate.Type, where: ChatWhere) {
        const chat = yield* getOne(where)
        const { set, row } = yield* Chat.makeUpdate({ id: chat.id, ...fields })

        // Only the update variant's fields, under the `where` again: a change landing after the
        // read is kept.
        yield* chats.update(row, encodeWhere(where))
        return new Chat({ ...chat, ...set })
      },
      Effect.catchIf(SchemaIssue.isIssue, Effect.die),
    )

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
