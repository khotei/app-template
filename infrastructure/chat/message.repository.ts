import { and, eq, type SQL } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { AttachmentId } from '@app-template/domain/attachment'
import {
  type ChatId,
  isActiveMessage,
  Message,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'

import { attachments } from '#infrastructure/attachment/attachment.entity'
import {
  activeMessage,
  MessageInsert,
  MessageRow,
  messages,
} from '#infrastructure/chat/message.entity'
import { Db, orDieWithSqlError } from '#infrastructure/db/db.client'
import { createCollection, createIndex } from '#infrastructure/kv/kv-collection'

const chatMessagesKey = (chatId: ChatId) => `${chatId}/messages`

export const MessageRepositoryKv = Layer.effect(
  MessageRepository,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const messages = createCollection(store, { prefix: 'messages/', schema: Message })
    const chatMessages = createIndex(store, { prefix: 'chats/', id: MessageId })
    return MessageRepository.of({
      insert: Effect.fn('MessageRepository.insert')(function* (message) {
        yield* messages.set(message.id, message)
        yield* chatMessages.append(chatMessagesKey(message.chatId), message.id)
      }),
      update: Effect.fn('MessageRepository.update')((message: Message) =>
        messages.update(message.id, () => message),
      ),
      selectById: Effect.fn('MessageRepository.selectById')(messages.get),
      selectByChat: Effect.fn('MessageRepository.selectByChat')((chatId: ChatId) =>
        Effect.flatMap(chatMessages.list(chatMessagesKey(chatId)), messages.getMany),
      ),
      // Only the last message can be active: a send is refused while one is.
      selectActiveByChat: Effect.fn('MessageRepository.selectActiveByChat')(function* (chatId) {
        const ids = yield* chatMessages.list(chatMessagesKey(chatId))
        const last = Arr.last(ids)
        if (Option.isNone(last)) return Option.none()

        const stored = yield* messages.get(last.value)
        return Option.filter(stored, isActiveMessage)
      }),
      // The index goes last, so a retry after a crash still finds the messages it lists.
      deleteByChat: Effect.fn('MessageRepository.deleteByChat')(function* (chatId) {
        const ids = yield* chatMessages.list(chatMessagesKey(chatId))
        yield* Effect.forEach(ids, (id) => messages.delete(id), { discard: true })
        yield* chatMessages.delete(chatMessagesKey(chatId))
      }),
    })
  }),
)

const encodeMessage = Schema.encodeEffect(MessageInsert)

const decodeMessageRow = Schema.decodeEffect(MessageRow)

const decodeAttachmentIds = Schema.decodeEffect(Schema.Array(AttachmentId))

interface MessageAttachmentRow {
  readonly message: typeof MessageRow.Encoded
  readonly attachmentId: string | null
}

const decodeMessage = Effect.fnUntraced(function* (
  rows: Arr.NonEmptyReadonlyArray<MessageAttachmentRow>,
) {
  const fields = yield* decodeMessageRow(Arr.headNonEmpty(rows).message)
  const attachmentIds = yield* decodeAttachmentIds(
    Arr.flatMapNullishOr(rows, (row) => row.attachmentId),
  )
  return new Message({ ...fields, attachmentIds })
})

/** Folds the joined rows into messages; a message's rows must be adjacent. */
const decodeMessages = (rows: ReadonlyArray<MessageAttachmentRow>) =>
  Arr.isReadonlyArrayNonEmpty(rows)
    ? Effect.forEach(
        Arr.groupWith(rows, (self, that) => self.message.id === that.message.id),
        decodeMessage,
      )
    : Effect.succeed([])

export const MessageRepositoryPg = Layer.effect(
  MessageRepository,
  Effect.map(Db, (db) => {
    // A join, not a relational query, so the active read can use `activeMessage`, which names
    // the unaliased table. A message spans one row per attachment, hence no `.limit(1)`.
    const selectMessages = Effect.fnUntraced(function* (where: SQL | undefined) {
      const rows = yield* db
        .select({ message: messages, attachmentId: attachments.id })
        .from(messages)
        .leftJoin(attachments, eq(attachments.messageId, messages.id))
        .where(where)
        .orderBy(messages.createdAt, messages.id, attachments.createdAt, attachments.id)
      return yield* decodeMessages(rows)
    })

    return MessageRepository.of({
      insert: Effect.fn('MessageRepository.insert')(function* (message) {
        const row = yield* encodeMessage(message)
        yield* db.insert(messages).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('MessageRepository.update')(function* (message) {
        const row = yield* encodeMessage(message)
        yield* db.update(messages).set(row).where(eq(messages.id, message.id))
      }, orDieWithSqlError),
      selectById: Effect.fn('MessageRepository.selectById')(
        (id: MessageId) => Effect.map(selectMessages(eq(messages.id, id)), Arr.head),
        orDieWithSqlError,
      ),
      selectByChat: Effect.fn('MessageRepository.selectByChat')(
        (chatId: ChatId) => selectMessages(eq(messages.chatId, chatId)),
        orDieWithSqlError,
      ),
      selectActiveByChat: Effect.fn('MessageRepository.selectActiveByChat')(
        (chatId: ChatId) =>
          Effect.map(selectMessages(and(eq(messages.chatId, chatId), activeMessage)), (found) =>
            Option.filter(Arr.head(found), isActiveMessage),
          ),
        orDieWithSqlError,
      ),
      deleteByChat: Effect.fn('MessageRepository.deleteByChat')(
        (chatId: ChatId) => db.delete(messages).where(eq(messages.chatId, chatId)),
        orDieWithSqlError,
      ),
    })
  }),
)
