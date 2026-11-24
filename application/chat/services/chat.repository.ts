import { Context, Effect, Layer, type Option, Schema, UndefinedOr } from 'effect'
import { SqlClient, SqlModel, SqlSchema } from 'effect/sql'

import { UserId } from '@app-template/application/identity'
import { buildWhereFragment } from '@app-template/packages/db'

import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { ChatId } from '#chat/domain/chat.util'

/** A chat by id; a `userId` limits it to that user's, a `title` to one so titled, `none` to an untitled one. */
export const ChatFilter = Schema.Struct({
  id: Schema.optional(ChatId),
  userId: Schema.optional(UserId),
  title: Schema.optional(Schema.OptionFromNullOr(ChatTitle)),
})
export type ChatFilter = typeof ChatFilter.Type

const ChatUpdate = Schema.Struct({ to: Chat.update, where: ChatFilter })

export class ChatRepository extends Context.Service<
  ChatRepository,
  {
    readonly insert: (chat: typeof Chat.insert.Type) => Effect.Effect<void>
    /** Writes `to` on its chat while `where` holds of it; dies when it writes nothing. */
    readonly update: (to: typeof Chat.update.Type, where: ChatFilter) => Effect.Effect<void>
    /** Returns a chat where `where` holds, with its newest Run. */
    readonly selectOne: (where: ChatFilter) => Effect.Effect<Option.Option<Chat>>
    /** Returns the chats where `where` holds, the newest created first, then the greater id. */
    readonly selectMany: (where: ChatFilter) => Effect.Effect<ReadonlyArray<Chat>>
    /** Removes the chat, its messages and Runs by the cascade; a chat already gone is no error. */
    readonly delete: (id: ChatId) => Effect.Effect<void>
  }
>()('@app-template/application/chat/services/ChatRepository', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const table = yield* SqlModel.makeRepository(Chat, {
      tableName: 'chats',
      spanPrefix: 'ChatRepository',
      idColumn: 'id',
    })

    const encodeWhere = buildWhereFragment<typeof ChatFilter.Encoded>({
      id: UndefinedOr.map((id) => sql`chats.id = ${id}`),
      userId: UndefinedOr.map((userId) => sql`chats.user_id = ${userId}`),
      // SQL's `=` never matches `null`.
      title: UndefinedOr.map((title) =>
        title === null ? sql`chats.title is null` : sql`chats.title = ${title}`,
      ),
    })

    const select = (where: typeof ChatFilter.Encoded) => sql`
      select chats.*, to_jsonb(run) as run
      from chats
      left join lateral (
        select * from runs
        where runs.chat_id = chats.id
        order by runs.created_at desc, runs.id desc
        limit 1
      ) run on true
      where ${encodeWhere(where)}`

    const findFirst = SqlSchema.findOneOption({
      Request: ChatFilter,
      Result: Chat,
      execute: (where) => sql`${select(where)} limit 1`,
    })

    const findAll = SqlSchema.findAll({
      Request: ChatFilter,
      Result: Chat,
      execute: (where) => sql`${select(where)} order by chats.created_at desc, chats.id desc`,
    })

    const updateWhere = SqlSchema.findNonEmpty({
      Request: ChatUpdate,
      Result: Schema.Struct({ id: ChatId }),
      // By the id `to` carries, so a `where` of no field still writes one chat.
      execute: ({ to, where }) => sql`
        update chats set ${sql.update(to, ['id'])}
        where chats.id = ${to.id} and ${encodeWhere(where)}
        returning chats.id`,
    })

    return {
      insert: Effect.fn('ChatRepository.insert')(table.insertVoid, Effect.orDie),
      update: Effect.fn('ChatRepository.update')(
        (to: typeof Chat.update.Type, where: ChatFilter) => updateWhere({ to, where }),
        Effect.asVoid,
        Effect.orDie,
      ),
      selectOne: Effect.fn('ChatRepository.selectOne')(findFirst, Effect.orDie),
      selectMany: Effect.fn('ChatRepository.selectMany')(findAll, Effect.orDie),
      delete: Effect.fn('ChatRepository.delete')(table.delete, Effect.orDie),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
