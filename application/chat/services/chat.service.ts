import { Context, Effect, Layer, SchemaIssue, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { Chat, ChatFields } from '#chat/domain/chat.model'
import { ChatRepository } from '#chat/services/chat.repository'

/**
 * A chat by id; a `userId` limits it to that user's, a `title` to one so titled, `none` to an
 * untitled one.
 */
export type ChatWhere = Types.Simplify<Pick<Chat, 'id'> & Partial<Pick<Chat, 'userId' | 'title'>>>

export class ChatService extends Context.Service<
  ChatService,
  {
    readonly create: (userId: UserId) => Effect.Effect<Chat>
    /** The user's chats, the newest created first. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<Chat>>
    readonly getOne: (where: ChatWhere) => Effect.Effect<Chat, ChatNotFoundError>
    /** Sets `fields` on the chat `where` finds and moves its `updatedAt`. */
    readonly update: (
      fields: Types.Simplify<Pick<Chat, 'title'>>,
      where: ChatWhere,
    ) => Effect.Effect<Chat, ChatNotFoundError>
    /** Removes the user's chat with its messages and Runs. */
    readonly delete: (where: ChatWhere) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/application/chat/services/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository

    const create = Effect.fn('ChatService.create')(function* (userId: UserId) {
      const row = yield* ChatFields.insert.makeEffect({ userId })

      yield* chats.insert(row)
      return new Chat(row)
    }, Effect.orDie)

    const list = Effect.fn('ChatService.list')((userId: UserId) => chats.selectMany({ userId }))

    const getOne = Effect.fn('ChatService.getOne')(
      (where: ChatWhere) => chats.selectOne(where),
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new ChatNotFoundError({ id: where.id })),
        ),
    )

    const update = Effect.fn('ChatService.update')(
      function* (fields: Types.Simplify<Pick<Chat, 'title'>>, where: ChatWhere) {
        const chat = yield* getOne(where)
        const set = yield* ChatFields.update.makeEffect({ id: chat.id, ...fields })

        // Only the update variant's fields, under the `where` again: a change landing after the
        // read is kept.
        yield* chats.update(set, where)
        return new Chat({ ...chat, ...set })
      },
      Effect.catchIf(SchemaIssue.isIssue, Effect.die),
    )

    const remove = Effect.fn('ChatService.delete')(function* (where: ChatWhere) {
      const chat = yield* getOne(where)

      // The cascade takes the messages and the Runs, by their `chat_id`.
      yield* chats.delete({ id: chat.id })
    })

    return { create, list, getOne, update, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
