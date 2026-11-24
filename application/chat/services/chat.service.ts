import { Context, Effect, Layer, Schema, SchemaIssue, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { ChatRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { Chat } from '#chat/domain/chat.model'

/**
 * A chat by id, as the repository's filter takes each field, so it reaches it as it is; a
 * `userId` limits it to that user's, a `title` that is null to an untitled one.
 */
export type ChatWhere = Types.Simplify<
  Pick<Chat, 'id'> & Partial<Pick<Chat, 'userId'>> & { readonly title?: { readonly isNull: true } }
>

/** A chat by id and its owner: what a call on a user's behalf names, so none reaches another's. */
export type ChatOwnerWhere = Types.Simplify<Pick<Chat, 'id' | 'userId'>>

export class ChatService extends Context.Service<
  ChatService,
  {
    readonly create: (userId: UserId) => Effect.Effect<Chat>
    /** The user's chats, the newest created first. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<Chat>>
    /** The chat of the user `where` names; another's is not found. */
    readonly getOne: (where: ChatOwnerWhere) => Effect.Effect<Chat, ChatNotFoundError>
    /** Sets `fields` on the chat `where` finds and moves its `updatedAt`. */
    readonly update: (
      fields: Types.Simplify<Pick<Chat, 'title'>>,
      where: ChatWhere,
    ) => Effect.Effect<Chat, ChatNotFoundError>
    /** Removes the chat of the user `where` names, with its messages and Runs; another's is not found. */
    readonly delete: (where: ChatOwnerWhere) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/application/chat/services/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository

    const create = Effect.fn('ChatService.create')(function* (userId: UserId) {
      const fields = yield* Chat.insert.makeEffect({ userId })
      const row = yield* encodeWith(Chat.insert)(fields)

      yield* chats.insert(row)
      return new Chat(fields)
    }, Effect.orDie)

    const list = Effect.fn('ChatService.list')(
      (userId: UserId) => chats.selectMany({ userId }),
      Effect.flatMap(decodeWith(Schema.Array(Chat))),
    )

    const getOne = Effect.fn('ChatService.getOne')(
      (where: ChatWhere) => chats.selectOne(where),
      Effect.flatMap(decodeWith(Schema.Option(Chat))),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new ChatNotFoundError({ id: where.id })),
        ),
    )

    const update = Effect.fn('ChatService.update')(
      function* (fields: Types.Simplify<Pick<Chat, 'title'>>, where: ChatWhere) {
        const chat = yield* getOne(where)
        const set = yield* Chat.update.makeEffect({ id: chat.id, ...fields })
        const row = yield* encodeWith(Chat.update)(set)

        // Only the update variant's fields, under the `where` again: a change landing after the
        // read is kept.
        yield* chats.update(row, where)
        return new Chat({ ...chat, ...set })
      },
      Effect.catchIf(SchemaIssue.isIssue, Effect.die),
    )

    const remove = Effect.fn('ChatService.delete')(function* (where: ChatOwnerWhere) {
      yield* getOne(where)

      // Under the owner again; the cascade takes the messages and the Runs, by their key to the chat.
      yield* chats.delete(where)
    })

    return { create, list, getOne, update, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
