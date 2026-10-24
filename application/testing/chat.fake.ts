import { Array as Arr, Effect, Layer, Option } from 'effect'

import { AttachmentRepository } from '@app-template/domain/attachment'
import {
  type Chat,
  type ChatId,
  ChatRepository,
  isActiveMessage,
  type Message,
  type MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { MessageRepositoryPg } from '@app-template/infrastructure/chat'

/**
 * A write that runs once, on the next `selectActiveByChat` of any caller. Armed right before the
 * send under test, it lands after that send's active-message check and before its writes.
 */
export interface Interleaving {
  write: Effect.Effect<void>
}

/**
 * The Postgres message repository, yielding after `selectActiveByChat`, then running the armed
 * write.
 *
 * The yield hands the turn to a concurrent send or delete between this send's check and its
 * writes.
 */
export const interleaveMessages = () => {
  const interleaving: Interleaving = { write: Effect.void }
  const takeInterleaving = Effect.suspend(() => {
    const { write } = interleaving
    interleaving.write = Effect.void
    return write
  })
  const layer = Layer.effect(
    MessageRepository,
    Effect.map(MessageRepository, (inner) =>
      MessageRepository.of({
        ...inner,
        selectActiveByChat: (chatId) =>
          Effect.tap(inner.selectActiveByChat(chatId), () =>
            Effect.andThen(Effect.yieldNow, takeInterleaving),
          ),
      }),
    ),
  ).pipe(Layer.provide(MessageRepositoryPg))
  return { interleaving, layer }
}

/** The Postgres attachment repository, yielding after each `selectByIds`. */
export const AttachmentRepositoryYielding = Layer.effect(
  AttachmentRepository,
  Effect.map(AttachmentRepository, (inner) =>
    AttachmentRepository.of({
      ...inner,
      selectByIds: (ids) => Effect.tap(inner.selectByIds(ids), Effect.yieldNow),
    }),
  ),
).pipe(Layer.provide(AttachmentRepositoryPg))

/**
 * Chats in a map of the layer's own, for a test that steps the `TestClock`, which a database's
 * I/O would outrun. No foreign key: deleting a chat leaves its messages.
 */
export const ChatRepositoryMemory = Layer.sync(ChatRepository, () => {
  const rows = new Map<ChatId, Chat>()
  return ChatRepository.of({
    insert: (chat) =>
      Effect.sync(() => {
        rows.set(chat.id, chat)
      }),
    update: (chat) =>
      Effect.sync(() => {
        if (rows.has(chat.id)) rows.set(chat.id, chat)
      }),
    selectById: (id) => Effect.sync(() => Option.fromUndefinedOr(rows.get(id))),
    selectByUser: (userId) =>
      Effect.sync(() => Arr.filter([...rows.values()], (chat) => chat.userId === userId)),
    delete: (id) =>
      Effect.sync(() => {
        rows.delete(id)
      }),
  })
})

/** Messages in a map of the layer's own, in insertion order; see `ChatRepositoryMemory`. */
export const MessageRepositoryMemory = Layer.sync(MessageRepository, () => {
  const rows = new Map<MessageId, Message>()
  const inChat = (chatId: ChatId) =>
    Arr.filter([...rows.values()], (message) => message.chatId === chatId)
  return MessageRepository.of({
    insert: (message) =>
      Effect.sync(() => {
        rows.set(message.id, message)
      }),
    update: (message) =>
      Effect.sync(() => {
        if (rows.has(message.id)) rows.set(message.id, message)
      }),
    selectById: (id) => Effect.sync(() => Option.fromUndefinedOr(rows.get(id))),
    selectByChat: (chatId) => Effect.sync(() => inChat(chatId)),
    selectActiveByChat: (chatId) =>
      Effect.sync(() => Arr.findFirst(inChat(chatId), isActiveMessage)),
    deleteByChat: (chatId) =>
      Effect.sync(() => {
        for (const message of inChat(chatId)) rows.delete(message.id)
      }),
  })
})
