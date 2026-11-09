import {
  Array as Arr,
  Context,
  Effect,
  HashMap,
  Layer,
  Option,
  Order,
  Predicate,
  pipe,
  Ref,
  Schema,
  Struct,
  UndefinedOr,
} from 'effect'
import { constTrue } from 'effect/Function'

import { orDieUnless } from '@app-template/packages/db'

import type { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { ChatEntity, type ChatEntityWhere } from '#kernel/data/chat/chat.entity'
import { ChatRepository } from '#kernel/data/chat/chat.repository'
import { MessageEntity, type MessageEntityWhere } from '#kernel/data/chat/message.entity'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import { activeRunStatuses } from '#kernel/data/chat/message.table'
import { RunEntity, type RunEntityWhere } from '#kernel/data/chat/run.entity'
import { RunRepository } from '#kernel/data/chat/run.repository'
import { AttachmentRows } from '#testing/data/attachment.test-fake'
import {
  deleteRows,
  inCreationOrderWhere,
  insertRow,
  matches,
  matchesAny,
  updateRows,
  writeSet,
} from '#testing/data/rows.test-util'

const ChatRow = Schema.Struct(Struct.omit(ChatEntity.fields, ['attachments', 'latestRun']))
type ChatRow = typeof ChatRow.Type

const MessageRow = Schema.Struct(Struct.omit(MessageEntity.fields, ['attachments']))
type MessageRow = typeof MessageRow.Type

const RunRow = Schema.Struct(Struct.omit(RunEntity.fields, ['userMessage', 'assistantMessage']))
type RunRow = typeof RunRow.Type

/** The rows `ChatRepositoryTest` keeps, by id, without their attachments and Runs. */
export class ChatRows extends Context.Service<
  ChatRows,
  Ref.Ref<HashMap.HashMap<string, ChatRow>>
>()('@app-template/kernel/data/testing/ChatRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<string, ChatRow>()))
}

/** The rows `MessageRepositoryTest` keeps, by id, without their attachments. */
export class MessageRows extends Context.Service<
  MessageRows,
  Ref.Ref<HashMap.HashMap<string, MessageRow>>
>()('@app-template/kernel/data/testing/MessageRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<string, MessageRow>()))
}

/** The rows `RunRepositoryTest` keeps, by id, without their messages. */
export class RunRows extends Context.Service<RunRows, Ref.Ref<HashMap.HashMap<string, RunRow>>>()(
  '@app-template/kernel/data/testing/RunRows',
) {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<string, RunRow>()))
}

interface Tables {
  readonly chats: HashMap.HashMap<string, ChatRow>
  readonly messages: HashMap.HashMap<string, MessageRow>
  readonly attachments: HashMap.HashMap<string, AttachmentEntity>
  readonly runs: HashMap.HashMap<string, RunRow>
}

const newestFirst = Order.flip(Order.mapInput(Order.Date, (chat: ChatRow) => chat.createdAt))

const isActiveRun = matchesAny<RunRow>({ status: activeRunStatuses })

/** Holds while no chat has two active Runs, as `runs_chat_id_active_index` keeps it. */
function holdsActiveRunIndex(runs: HashMap.HashMap<string, RunRow>) {
  const chatIds = pipe(
    runs,
    HashMap.toValues,
    Arr.filter(isActiveRun),
    Arr.map(Struct.get('chatId')),
  )
  return Arr.dedupe(chatIds).length === chatIds.length
}

/**
 * Holds while only an assistant message names a Run, and no two name the same one, as
 * `messages_run_id_check` and the unique `run_id` keep it.
 */
function holdsMessageRuns(messages: HashMap.HashMap<string, MessageRow>) {
  const rows = HashMap.toValues(messages)
  const runIds = pipe(
    rows,
    Arr.map((row) => Option.fromNullOr(row.runId)),
    Arr.getSomes,
  )
  return (
    Arr.every(rows, (row) => (row.author === 'assistant') === Predicate.isNotNull(row.runId)) &&
    Arr.dedupe(runIds).length === runIds.length
  )
}

const holdsChatWhere = (where: ChatEntityWhere) => matches<ChatRow>(where)

interface ChatRowChild {
  readonly id: string
  readonly chatId: string
}

/**
 * A message's or a Run's where; `userId` holds when the row's chat is the user's, as the
 * repositories' subquery reads.
 */
const holdsChildWhere = (
  chats: HashMap.HashMap<string, ChatRow>,
  where: MessageEntityWhere | RunEntityWhere,
) =>
  Predicate.and(
    matches<ChatRowChild>({ id: where.id, chatId: where.chatId }),
    UndefinedOr.match(where.userId, {
      onUndefined: () => constTrue,
      onDefined: (userId) => (row: ChatRowChild) =>
        HashMap.get(chats, row.chatId).pipe(Option.exists(matches<ChatRow>({ userId }))),
    }),
  )

const holdsRunWhere = (chats: HashMap.HashMap<string, ChatRow>, where: RunEntityWhere) =>
  Predicate.and(holdsChildWhere(chats, where), matchesAny<RunRow>({ status: where.status }))

/** The message with its attachments, as `withAttachments` nests them. */
const withAttachmentsOf =
  (rows: Tables) =>
  (message: MessageRow): MessageEntity => ({
    ...message,
    attachments: inCreationOrderWhere(
      rows.attachments,
      matches<AttachmentEntity>({ messageId: message.id }),
    ),
  })

/** The Run with its messages, as `withMessages` nests them; its foreign key keeps the first. */
const withMessagesOf =
  (rows: Tables) =>
  (run: RunRow): RunEntity => ({
    ...run,
    userMessage: pipe(
      HashMap.get(rows.messages, run.userMessageId),
      Option.getOrThrow,
      withAttachmentsOf(rows),
    ),
    assistantMessage: pipe(
      HashMap.toValues(rows.messages),
      Arr.findFirst(matches<MessageRow>({ runId: run.id })),
      Option.map(withAttachmentsOf(rows)),
      Option.getOrNull,
    ),
  })

const runsWhere = (rows: Tables, where: Predicate.Predicate<RunRow>) =>
  pipe(inCreationOrderWhere(rows.runs, where), Arr.map(withMessagesOf(rows)))

const decodeChat = Schema.decodeUnknownEffect(ChatRow)

/** The column defaults Postgres fills on an insert that leaves them out. */
const chatDefaults = { title: null } as const

const messageDefaults = { runId: null } as const

const decodeMessage = Schema.decodeUnknownEffect(MessageRow)

const runDefaults = { failure: null } as const

const decodeRun = Schema.decodeUnknownEffect(RunRow)

/** The four tables' rows, and one read of them all for a relation or an owner. */
const tables = Effect.gen(function* () {
  const chats = yield* ChatRows
  const messages = yield* MessageRows
  const attachments = yield* AttachmentRows
  const runs = yield* RunRows

  const read: Effect.Effect<Tables> = Effect.all({
    chats: Ref.get(chats),
    messages: Ref.get(messages),
    attachments: Ref.get(attachments),
    runs: Ref.get(runs),
  })
  return { chats, messages, attachments, runs, read }
})

/**
 * Requires the id and the timestamps every caller passes, where Postgres would default the id,
 * and fills the other defaults. Copies the guards the repository's e2e proves: the primary key,
 * the where fields, the set fields, and the cascade from a chat to its messages and Runs and,
 * through the messages, their attachments.
 */
export const ChatRepositoryTest = Layer.effect(
  ChatRepository,
  Effect.gen(function* () {
    const { chats, messages, attachments, runs, read } = yield* tables

    const selectMany = (where: ChatEntityWhere) =>
      read.pipe(
        Effect.map((rows) =>
          pipe(
            rows.chats,
            HashMap.filter(holdsChatWhere(where)),
            HashMap.toValues,
            Arr.sort(newestFirst),
            Arr.map((chat) => ({
              ...chat,
              attachments: inCreationOrderWhere(
                rows.attachments,
                matches<AttachmentEntity>({ chatId: chat.id }),
              ),
              latestRun: pipe(
                runsWhere(rows, matches<RunRow>({ chatId: chat.id })),
                Arr.last,
                Option.getOrNull,
              ),
            })),
          ),
        ),
      )

    const cascade = (deleted: ReadonlyArray<ChatRow>) =>
      deleteRows(runs, matchesAny<RunRow>({ chatId: Arr.map(deleted, Struct.get('id')) })).pipe(
        Effect.andThen(
          deleteRows(
            messages,
            matchesAny<MessageRow>({ chatId: Arr.map(deleted, Struct.get('id')) }),
          ),
        ),
        Effect.flatMap((removed) =>
          deleteRows(
            attachments,
            matchesAny<AttachmentEntity>({ messageId: Arr.map(removed, Struct.get('id')) }),
          ),
        ),
      )

    return ChatRepository.of({
      insert: (chat) =>
        decodeChat({ ...chatDefaults, ...chat }).pipe(
          Effect.orDie,
          Effect.flatMap((row) => insertRow(chats, { row })),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no chat was inserted: its id is taken'),
        ),
      update: (set, where) =>
        updateRows(chats, {
          where: holdsChatWhere(where),
          update: writeSet({ title: true, updatedAt: true }, set),
        }).pipe(orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no chat was updated')),
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
      delete: (where) =>
        deleteRows(chats, holdsChatWhere(where)).pipe(
          Effect.tap(cascade),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no chat was deleted'),
        ),
    })
  }),
)

/**
 * Requires the id and the timestamps every caller passes, where Postgres would default the id,
 * and fills `runId`. Copies the guards the repository's e2e proves: the primary key, the where
 * fields with the owner read through the chat, and the check and the unique key on `run_id`.
 */
export const MessageRepositoryTest = Layer.effect(
  MessageRepository,
  Effect.gen(function* () {
    const { messages, read } = yield* tables

    const selectMany = (where: MessageEntityWhere) =>
      read.pipe(
        Effect.map((rows) =>
          pipe(
            inCreationOrderWhere(rows.messages, holdsChildWhere(rows.chats, where)),
            Arr.map(withAttachmentsOf(rows)),
          ),
        ),
      )

    return MessageRepository.of({
      insert: (message) =>
        decodeMessage({ ...messageDefaults, ...message }).pipe(
          Effect.orDie,
          Effect.flatMap((row) => insertRow(messages, { row, accepts: holdsMessageRuns })),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, `message ${message.id} was not inserted`),
        ),
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
    })
  }),
)

/**
 * Requires the id and the timestamps every caller passes, where Postgres would default the id,
 * and fills `failure`. Copies the guards the repository's e2e proves: the primary key, the where
 * fields with the owner read through the chat, the set fields, and the partial unique index on
 * the active Run, which refuses an insert or an update that gives a chat a second one.
 */
export const RunRepositoryTest = Layer.effect(
  RunRepository,
  Effect.gen(function* () {
    const { runs, read } = yield* tables

    return RunRepository.of({
      insert: (run) =>
        decodeRun({ ...runDefaults, ...run }).pipe(
          Effect.orDie,
          Effect.flatMap((row) => insertRow(runs, { row, accepts: holdsActiveRunIndex })),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, `run ${run.id} was not inserted`),
        ),
      update: (set, where) =>
        read.pipe(
          Effect.flatMap((rows) =>
            updateRows(runs, {
              where: holdsRunWhere(rows.chats, where),
              update: writeSet({ status: true, failure: true, updatedAt: true }, set),
              accepts: holdsActiveRunIndex,
            }),
          ),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no run was updated'),
        ),
      selectOne: (where) =>
        read.pipe(
          Effect.map((rows) => pipe(runsWhere(rows, holdsRunWhere(rows.chats, where)), Arr.last)),
        ),
    })
  }),
)
