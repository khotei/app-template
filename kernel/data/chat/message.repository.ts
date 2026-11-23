import {
  Array as Arr,
  Context,
  Effect,
  flow,
  Layer,
  Option,
  pipe,
  Schema,
  Struct,
  UndefinedOr,
} from 'effect'
import { SqlClient } from 'effect/sql'

import { buildColumns, buildFields, buildWhereFragment } from '@app-template/packages/db'

import {
  buildMessageEntity,
  type MessageEntity,
  type MessageEntityWhere,
} from '#kernel/data/chat/message.entity'
import { MessageColumns } from '#kernel/data/chat/message.table'
import { RunColumns } from '#kernel/data/chat/run.table'

const messageColumns = Struct.keys(MessageColumns.fields)

/** A Run as `to_jsonb` nests it, its timestamps as text. */
const NestedRun = Schema.NullOr(Schema.toCodecJson(RunColumns))

/** A message as its read selects it, with both Runs `buildMessageEntity` picks from. */
const MessageRead = Schema.Struct({
  ...MessageColumns.fields,
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

    // `userId` is the owner of the row's chat, so a message of another user's chat reads as absent.
    const encodeWhere = buildWhereFragment<MessageEntityWhere>({
      id: UndefinedOr.map((id) => sql`messages.id = ${id}`),
      chatId: UndefinedOr.map((chatId) => sql`messages.chat_id = ${chatId}`),
      userId: UndefinedOr.map(
        (userId) => sql`messages.chat_id in (select id from chats where user_id = ${userId})`,
      ),
    })

    // A user's message: the newest of the Runs that answer it; an assistant's: the Run that wrote it.
    const select = (where: MessageEntityWhere) => sql`
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

    return {
      insert: Effect.fn('MessageRepository.insert')(
        (message: MessageColumns) =>
          sql`insert into messages ${sql.insert(pipe(message, buildColumns(messageColumns)))}`,
        Effect.orDie,
      ),
      selectOne: Effect.fn('MessageRepository.selectOne')(
        (where: MessageEntityWhere) => sql`${select(where)} limit 1`,
        Effect.map(flow(buildFields, Arr.head)),
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Option(MessageRead))),
        Effect.map(Option.map(buildMessageEntity)),
        Effect.orDie,
      ),
      selectMany: Effect.fn('MessageRepository.selectMany')(
        select,
        Effect.map(buildFields),
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(MessageRead))),
        Effect.map(Arr.map(buildMessageEntity)),
        Effect.orDie,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
