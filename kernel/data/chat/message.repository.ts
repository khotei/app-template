import { Array as Arr, Context, Effect, Layer, Option, Schema, UndefinedOr } from 'effect'
import { SqlClient, SqlModel, SqlSchema } from 'effect/sql'

import { buildWhereFragment } from '@app-template/packages/db'

import {
  buildMessageEntity,
  type MessageEntity,
  type MessageEntityWhere,
  MessageRow,
} from '#kernel/data/chat/message.entity'
import type { MessageColumns } from '#kernel/data/chat/message.table'
import { RunColumns } from '#kernel/data/chat/run.table'

/** The request of a read: `MessageEntityWhere`, whose ids need no encoding. */
const MessageWhere = Schema.Struct({
  id: Schema.optional(Schema.String),
  chatId: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
})

/** A Run as `to_jsonb` nests it, its timestamps as text. */
const NestedRun = Schema.NullOr(Schema.toCodecJson(RunColumns))

/** A message as its read selects it, with both Runs `buildMessageEntity` picks from. */
const MessageRead = Schema.Struct({
  ...MessageRow.fields,
  newestRun: NestedRun,
  replyOf: NestedRun,
})

export class MessageRepository extends Context.Service<
  MessageRepository,
  {
    /** A message is never changed. */
    readonly insert: (message: MessageColumns) => Effect.Effect<void>
    /** Returns the first row in creation order where `where` holds. */
    readonly selectOne: (where: MessageEntityWhere) => Effect.Effect<Option.Option<MessageEntity>>
    /** Returns the rows where `where` holds, in creation order, a tie broken by id. */
    readonly selectMany: (where: MessageEntityWhere) => Effect.Effect<ReadonlyArray<MessageEntity>>
  }
>()('@app-template/kernel/data/chat/MessageRepository', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const table = yield* SqlModel.makeRepository(MessageRow, {
      tableName: 'messages',
      spanPrefix: 'MessageRepository',
      idColumn: 'id',
    })

    // `userId` is the owner of the row's chat, so a message of another user's chat reads as absent.
    const encodeWhere = buildWhereFragment<typeof MessageWhere.Encoded>({
      id: UndefinedOr.map((id) => sql`messages.id = ${id}`),
      chatId: UndefinedOr.map((chatId) => sql`messages.chat_id = ${chatId}`),
      userId: UndefinedOr.map(
        (userId) => sql`messages.chat_id in (select id from chats where user_id = ${userId})`,
      ),
    })

    // A user's message: the newest of the Runs that answer it; an assistant's: the Run that wrote it.
    const select = (where: typeof MessageWhere.Encoded) => sql`
      select messages.*, to_jsonb(newest_run) as newest_run, to_jsonb(reply_of) as reply_of
      from messages
      left join lateral (
        select * from runs
        where runs.user_message_id = messages.id
        order by runs.created_at desc, runs.id desc
        limit 1
      ) newest_run on true
      left join runs reply_of on reply_of.assistant_message_id = messages.id
      where ${encodeWhere(where)}
      order by messages.created_at, messages.id`

    const findFirst = SqlSchema.findOneOption({
      Request: MessageWhere,
      Result: MessageRead,
      execute: (where) => sql`${select(where)} limit 1`,
    })

    const findAll = SqlSchema.findAll({
      Request: MessageWhere,
      Result: MessageRead,
      execute: select,
    })

    return {
      insert: Effect.fn('MessageRepository.insert')(table.insertVoid, Effect.orDie),
      selectOne: Effect.fn('MessageRepository.selectOne')(
        findFirst,
        Effect.map(Option.map(buildMessageEntity)),
        Effect.orDie,
      ),
      selectMany: Effect.fn('MessageRepository.selectMany')(
        findAll,
        Effect.map(Arr.map(buildMessageEntity)),
        Effect.orDie,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
