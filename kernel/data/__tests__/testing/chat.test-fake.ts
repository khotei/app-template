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

import {
  deleteRows,
  insertRow,
  matches,
  matchesAny,
  orDieOnNoRows,
  updateRows,
  writeSet,
} from '@app-template/packages/db/testing'

import type { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { ChatEntity, type ChatEntityWhere } from '#kernel/data/chat/chat.entity'
import { ChatRepository } from '#kernel/data/chat/chat.repository'
import { MessageEntity, type MessageEntityWhere } from '#kernel/data/chat/message.entity'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import { activeMessageStatuses } from '#kernel/data/chat/message.table'
import { AttachmentRows } from '#testing/data/attachment.test-fake'

const ChatRow = Schema.Struct(Struct.omit(ChatEntity.fields, ['attachments']))
type ChatRow = typeof ChatRow.Type

const MessageRow = Schema.Struct(Struct.omit(MessageEntity.fields, ['attachments']))
type MessageRow = typeof MessageRow.Type

/** The rows `ChatRepositoryTest` keeps, by id, without their attachments. */
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

interface Created {
  readonly id: string
  readonly createdAt: Date
}

/** Creation order, a tie broken by id, as `inCreationOrder` in `message.entity.ts`. */
const inCreationOrder = Order.combine(
  Order.mapInput(Order.Date, (row: Created) => row.createdAt),
  Order.mapInput(Order.String, (row: Created) => row.id),
)

const newestFirst = Order.flip(Order.mapInput(Order.Date, (chat: ChatRow) => chat.createdAt))

/** The rows where `where` holds, in creation order. */
const inCreationOrderWhere = <Row extends Created>(
  rows: HashMap.HashMap<string, Row>,
  where: Predicate.Predicate<Row>,
) => pipe(rows, HashMap.filter(where), HashMap.toValues, Arr.sort(inCreationOrder))

const isActive = matchesAny<MessageRow>({
  author: ['assistant'],
  status: activeMessageStatuses,
})

/** Holds while no chat has two active messages, as `messages_chat_id_active_index` keeps it. */
const holdsActiveIndex = (messages: HashMap.HashMap<string, MessageRow>) => {
  const chatIds = pipe(
    messages,
    HashMap.toValues,
    Arr.filter(isActive),
    Arr.map(Struct.get('chatId')),
  )
  return Arr.dedupe(chatIds).length === chatIds.length
}

const holdsChatWhere = (where: ChatEntityWhere) =>
  matches<ChatRow>({
    id: where.id,
    userId: where.userId,
    title: where.title,
    status: where.status,
  })

/** `userId` holds when the message's chat is the user's, as the repository's subquery reads. */
const holdsMessageWhere = (chats: HashMap.HashMap<string, ChatRow>, where: MessageEntityWhere) =>
  Predicate.and(
    matches<MessageRow>({ id: where.id, chatId: where.chatId }),
    Predicate.and(
      UndefinedOr.match(where.userId, {
        onUndefined: () => constTrue,
        onDefined: (userId) => (message: MessageRow) =>
          HashMap.get(chats, message.chatId).pipe(Option.exists(matches<ChatRow>({ userId }))),
      }),
      matchesAny<MessageRow>({ status: where.status }),
    ),
  )

const decodeChat = Schema.decodeUnknownEffect(ChatRow)

/** The column defaults Postgres fills on an insert that leaves them out. */
const chatDefaults = { title: null, status: 'idle' } as const

const messageDefaults = { error: null } as const

const decodeMessage = Schema.decodeUnknownEffect(MessageRow)

/** The three tables' rows, and one read of them all for a relation or an owner. */
const tables = Effect.gen(function* () {
  const chats = yield* ChatRows
  const messages = yield* MessageRows
  const attachments = yield* AttachmentRows

  const read = Effect.all({
    chats: Ref.get(chats),
    messages: Ref.get(messages),
    attachments: Ref.get(attachments),
  })
  return { chats, messages, attachments, read }
})

/**
 * Requires the id and the timestamps every caller passes, where Postgres would default the id,
 * and fills the other defaults. Copies the guards the repository's e2e proves: the primary key,
 * the where fields, the set fields, and the cascade from a chat to its messages and, through
 * them, their attachments.
 */
export const ChatRepositoryTest = Layer.effect(
  ChatRepository,
  Effect.gen(function* () {
    const { chats, messages, attachments, read } = yield* tables

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
            })),
          ),
        ),
      )

    const cascade = (deleted: ReadonlyArray<ChatRow>) =>
      deleteRows(
        messages,
        matchesAny<MessageRow>({ chatId: Arr.map(deleted, Struct.get('id')) }),
      ).pipe(
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
          orDieOnNoRows('no chat was inserted: its id is taken'),
        ),
      update: (set, where) =>
        updateRows(chats, {
          where: holdsChatWhere(where),
          update: writeSet({ title: true, status: true, updatedAt: true }, set),
        }).pipe(orDieOnNoRows('no chat was updated')),
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
      delete: (where) =>
        deleteRows(chats, holdsChatWhere(where)).pipe(
          Effect.tap(cascade),
          orDieOnNoRows('no chat was deleted'),
        ),
    })
  }),
)

/**
 * Requires the id and the timestamps every caller passes, where Postgres would default the id,
 * and fills `error`. Copies the guards the repository's e2e proves: the primary key, the where
 * fields with the owner read through the chat, the set fields, and the partial unique index on
 * the active reply, which refuses an insert or an update that gives a chat a second one.
 */
export const MessageRepositoryTest = Layer.effect(
  MessageRepository,
  Effect.gen(function* () {
    const { messages, read } = yield* tables

    const selectMany = (where: MessageEntityWhere) =>
      read.pipe(
        Effect.map((rows) =>
          pipe(
            inCreationOrderWhere(rows.messages, holdsMessageWhere(rows.chats, where)),
            Arr.map((message) => ({
              ...message,
              attachments: inCreationOrderWhere(
                rows.attachments,
                matches<AttachmentEntity>({ messageId: message.id }),
              ),
            })),
          ),
        ),
      )

    return MessageRepository.of({
      insert: (message) =>
        decodeMessage({ ...messageDefaults, ...message }).pipe(
          Effect.orDie,
          Effect.flatMap((row) => insertRow(messages, { row, accepts: holdsActiveIndex })),
          orDieOnNoRows(`message ${message.id} was not inserted`),
        ),
      update: (set, where) =>
        read.pipe(
          Effect.flatMap((rows) =>
            updateRows(messages, {
              where: holdsMessageWhere(rows.chats, where),
              update: writeSet({ status: true, text: true, error: true, updatedAt: true }, set),
              accepts: holdsActiveIndex,
            }),
          ),
          orDieOnNoRows('no message was updated'),
        ),
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
    })
  }),
)
