import { Context, Effect, Layer, type Option, Schema, UndefinedOr } from 'effect'
import { SqlClient, SqlModel, SqlSchema } from 'effect/sql'

import { UserId } from '@app-template/application/identity'
import { buildWhereFragment } from '@app-template/packages/db'

import { ChatId } from '#chat/domain/chat.util'
import { Message, MessageFields } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'

/** `userId` is the owner of the message's chat, so a message of another user's chat reads as absent. */
export const MessageFilter = Schema.Struct({
  id: Schema.optional(MessageId),
  chatId: Schema.optional(ChatId),
  userId: Schema.optional(UserId),
})
export type MessageFilter = typeof MessageFilter.Type

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /** A message is never changed. */
    readonly insert: (message: typeof MessageFields.insert.Type) => Effect.Effect<void>
    /** Returns the first message in creation order where `where` holds. */
    readonly selectOne: (where: MessageFilter) => Effect.Effect<Option.Option<Message>>
    /** Returns the messages where `where` holds, in creation order, a tie broken by id. */
    readonly selectMany: (where: MessageFilter) => Effect.Effect<ReadonlyArray<Message>>
  }
>()('@app-template/application/chat/services/MessageRepository', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const table = yield* SqlModel.makeRepository(MessageFields, {
      tableName: 'messages',
      spanPrefix: 'MessageRepository',
      idColumn: 'id',
    })

    const encodeWhere = buildWhereFragment<typeof MessageFilter.Encoded>({
      id: UndefinedOr.map((id) => sql`messages.id = ${id}`),
      chatId: UndefinedOr.map((chatId) => sql`messages.chat_id = ${chatId}`),
      userId: UndefinedOr.map(
        (userId) => sql`messages.chat_id in (select id from chats where user_id = ${userId})`,
      ),
    })

    // A user's message nests the newest of the Runs that answer it, an assistant's the Run that
    // wrote it.
    const select = (where: typeof MessageFilter.Encoded) => sql`
      select messages.*, to_jsonb(run) as run
      from messages
      left join lateral (
        select * from runs
        where case messages.author
          when 'user' then runs.user_message_id = messages.id
          else runs.assistant_message_id = messages.id
        end
        order by runs.created_at desc, runs.id desc
        limit 1
      ) run on true
      where ${encodeWhere(where)}
      order by messages.created_at, messages.id`

    const findFirst = SqlSchema.findOneOption({
      Request: MessageFilter,
      Result: Message,
      execute: (where) => sql`${select(where)} limit 1`,
    })

    const findAll = SqlSchema.findAll({ Request: MessageFilter, Result: Message, execute: select })

    return {
      insert: Effect.fn('MessageRepository.insert')(table.insertVoid, Effect.orDie),
      selectOne: Effect.fn('MessageRepository.selectOne')(findFirst, Effect.orDie),
      selectMany: Effect.fn('MessageRepository.selectMany')(findAll, Effect.orDie),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
