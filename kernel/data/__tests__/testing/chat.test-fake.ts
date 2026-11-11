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
import type { ChatEntity, ChatEntityWhere } from '#kernel/data/chat/chat.entity'
import { ChatRepository } from '#kernel/data/chat/chat.repository'
import { ChatColumns } from '#kernel/data/chat/chat.table'
import type { MessageEntity, MessageEntityWhere } from '#kernel/data/chat/message.entity'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import { MessageColumns } from '#kernel/data/chat/message.table'
import type { RunEntity, RunEntityWhere } from '#kernel/data/chat/run.entity'
import { RunRepository } from '#kernel/data/chat/run.repository'
import { activeRunStatuses, RunColumns } from '#kernel/data/chat/run.table'
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

type ChatRow = ChatColumns
type MessageRow = MessageColumns
type RunRow = RunColumns

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

/**
 * Holds while no chat has two active Runs, a Run is done exactly when it names its reply, and no
 * two name the same one, as `runs_chat_id_active_index`, `runs_assistant_message_id_check` and
 * `runs_assistant_message_id_unique` keep it.
 */
function holdsRunGuards(runs: HashMap.HashMap<string, RunRow>) {
  const rows = HashMap.toValues(runs)
  const chatIds = pipe(rows, Arr.filter(isActiveRun), Arr.map(Struct.get('chatId')))
  const replyIds = pipe(
    rows,
    Arr.map((row) => Option.fromNullOr(row.assistantMessageId)),
    Arr.getSomes,
  )
  return (
    Arr.dedupe(chatIds).length === chatIds.length &&
    Arr.dedupe(replyIds).length === replyIds.length &&
    Arr.every(
      rows,
      (row) => (row.status === 'done') === Predicate.isNotNull(row.assistantMessageId),
    )
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
      Option.fromNullOr(run.assistantMessageId),
      Option.flatMap((id) => HashMap.get(rows.messages, id)),
      Option.map(withAttachmentsOf(rows)),
      Option.getOrNull,
    ),
  })

/** The newest Run where `where` holds, as a `one` relation ordered `newestFirst` reads it. */
const newestRunWhere = (
  runs: HashMap.HashMap<string, RunRow>,
  where: Predicate.Predicate<RunRow>,
) => pipe(inCreationOrderWhere(runs, where), Arr.last)

const runsWhere = (rows: Tables, where: Predicate.Predicate<RunRow>) =>
  pipe(inCreationOrderWhere(rows.runs, where), Arr.map(withMessagesOf(rows)))

const decodeChat = Schema.decodeUnknownEffect(ChatColumns)

/** The column defaults Postgres fills on an insert that leaves them out. */
const chatDefaults = { title: null } as const

const decodeMessage = Schema.decodeUnknownEffect(MessageColumns)

const runDefaults = { failure: null, assistantMessageId: null } as const

const decodeRun = Schema.decodeUnknownEffect(RunColumns)

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
            Arr.map(
              (chat): ChatEntity => ({
                ...chat,
                attachments: inCreationOrderWhere(
                  rows.attachments,
                  matches<AttachmentEntity>({ chatId: chat.id }),
                ),
                run: pipe(
                  newestRunWhere(rows.runs, matches<RunRow>({ chatId: chat.id })),
                  Option.getOrNull,
                ),
              }),
            ),
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
 * Requires the id and the timestamps every caller passes, where Postgres would default the id.
 * Copies the guards the repository's e2e proves: the primary key and the where fields with the
 * owner read through the chat.
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
        decodeMessage(message).pipe(
          Effect.orDie,
          Effect.flatMap((row) => insertRow(messages, { row })),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, `message ${message.id} was not inserted`),
        ),
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
    })
  }),
)

/**
 * Requires the id and the timestamps every caller passes, where Postgres would default the id,
 * and fills `failure` and `assistantMessageId`. Copies the guards the repository's e2e proves: the
 * primary key, the where fields with the owner read through the chat, the set fields, and the
 * Run's index, check and unique key, which refuse an insert or an update that breaks one.
 */
export const RunRepositoryTest = Layer.effect(
  RunRepository,
  Effect.gen(function* () {
    const { runs, read } = yield* tables

    return RunRepository.of({
      insert: (run) =>
        decodeRun({ ...runDefaults, ...run }).pipe(
          Effect.orDie,
          Effect.flatMap((row) => insertRow(runs, { row, accepts: holdsRunGuards })),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, `run ${run.id} was not inserted`),
        ),
      update: (set, where) =>
        read.pipe(
          Effect.flatMap((rows) =>
            updateRows(runs, {
              where: holdsRunWhere(rows.chats, where),
              update: writeSet(
                { status: true, failure: true, assistantMessageId: true, updatedAt: true },
                set,
              ),
              accepts: holdsRunGuards,
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
