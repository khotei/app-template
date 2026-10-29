import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  flow,
  HashMap,
  Layer,
  Option,
  Order,
  Predicate,
  pipe,
  Ref,
} from 'effect'
import { constTrue } from 'effect/Function'

import type { AttachmentId } from '#domain/attachment/attachment.id'
import type { Attachment } from '#domain/attachment/attachment.model'
import type { ChatId, MessageId } from '#domain/chat/chat.id'
import { Chat, type ChatDetail, type ChatSummary } from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import { isActiveMessage, type Message, type MessageDetail } from '#domain/chat/message.model'
import { type MessageOneWhere, MessageRepository } from '#domain/chat/message.port'
import { AttachmentRows } from '#domain/testing/attachment.test-fake'
import { matches } from '#domain/testing/rows.test-util'
import type { UserId } from '#domain/user/user.id'

/** The rows `ChatRepositoryTest` keeps, by id, for a test to arrange or read. */
export class ChatRows extends Context.Service<ChatRows, Ref.Ref<HashMap.HashMap<ChatId, Chat>>>()(
  '@app-template/domain/testing/ChatRows',
) {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<ChatId, Chat>()))
}

/** The rows `MessageRepositoryTest` keeps, by id, for a test to arrange or read. */
export class MessageRows extends Context.Service<
  MessageRows,
  Ref.Ref<HashMap.HashMap<MessageId, Message>>
>()('@app-template/domain/testing/MessageRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<MessageId, Message>()))
}

type Chats = HashMap.HashMap<ChatId, Chat>
type Messages = HashMap.HashMap<MessageId, Message>
type Attachments = HashMap.HashMap<AttachmentId, Attachment>

interface Created {
  readonly id: string
  readonly createdAt: DateTime.Utc
}

/** Creation order, a tie broken by id, as the Pg repositories read messages and attachments. */
const inCreationOrder = Order.combine(
  Order.mapInput(DateTime.Order, (row: Created) => row.createdAt),
  Order.mapInput(Order.String, (row: Created) => row.id),
)

const byLatestActivity = Order.flip(Order.mapInput(DateTime.Order, (chat: Chat) => chat.updatedAt))

const messagesOf = (messages: Messages, chatId: ChatId) =>
  pipe(
    messages,
    HashMap.filter(matches<Message>({ chatId })),
    HashMap.toValues,
    Arr.sort(inCreationOrder),
  )

/** The chat's active message, if any: the row the partial unique index guards. */
const activeOf = (messages: Messages, chatId: ChatId) =>
  Arr.findFirst(messagesOf(messages, chatId), isActiveMessage)

const isBoundTo =
  (messageId: MessageId) =>
  (attachment: Attachment): boolean =>
    Option.contains(attachment.messageId, messageId)

const detailOf =
  (attachments: Attachments) =>
  (message: Message): MessageDetail => ({
    message,
    attachments: pipe(
      attachments,
      HashMap.filter(isBoundTo(message.id)),
      HashMap.toValues,
      Arr.sort(inCreationOrder),
    ),
  })

const summaryOf =
  (messages: Messages) =>
  (chat: Chat): ChatSummary => ({ chat, activeMessage: activeOf(messages, chat.id) })

interface Tables {
  readonly chats: Chats
  readonly messages: Messages
  readonly attachments: Attachments
}

const chatDetailOf =
  (tables: Tables) =>
  (chat: Chat): ChatDetail => ({
    ...summaryOf(tables.messages)(chat),
    messages: Arr.map(messagesOf(tables.messages, chat.id), detailOf(tables.attachments)),
  })

const hasBoundAttachment = (tables: Tables, chatId: ChatId): boolean =>
  Arr.some(messagesOf(tables.messages, chatId), (message) =>
    HashMap.some(tables.attachments, isBoundTo(message.id)),
  )

/** Holds when the message's chat is the user's, as the Pg relation filter reads it. */
const isOwnedThroughChat = (
  chats: Chats,
  userId: UserId | undefined,
): Predicate.Predicate<Message> =>
  userId === undefined
    ? constTrue
    : (message) => Option.exists(HashMap.get(chats, message.chatId), matches<Chat>({ userId }))

const holdsMessageWhere = (tables: Tables, where: MessageOneWhere) =>
  Predicate.and(
    matches<Message>({ chatId: where.chatId }),
    isOwnedThroughChat(tables.chats, where.userId),
  )

const makeReadTables = Effect.gen(function* () {
  const chats = yield* ChatRows
  const messages = yield* MessageRows
  const attachments = yield* AttachmentRows

  return Effect.all({
    chats: Ref.get(chats),
    messages: Ref.get(messages),
    attachments: Ref.get(attachments),
  })
})

export const ChatRepositoryTest = Layer.effect(
  ChatRepository,
  Effect.gen(function* () {
    const chats = yield* ChatRows
    const messages = yield* MessageRows
    const readTables = yield* makeReadTables

    const withActiveMessage = (found: ReadonlyArray<Chat>) =>
      Effect.map(Ref.get(messages), (rows) => Arr.map(found, summaryOf(rows)))

    return ChatRepository.of({
      insert: (chat) => Ref.update(chats, HashMap.set(chat.id, chat)),
      update: (set, where) =>
        Ref.modify(chats, (rows) =>
          pipe(
            HashMap.get(rows, where.id),
            Option.filter(matches<Chat>(where)),
            Option.match({
              onNone: () => [false, rows] as const,
              onSome: (chat) =>
                [true, HashMap.set(rows, chat.id, new Chat({ ...chat, ...set }))] as const,
            }),
          ),
        ),
      selectOne: (where) =>
        Effect.map(
          Ref.get(chats),
          flow(HashMap.get(where.id), Option.filter(matches<Chat>(where))),
        ),
      selectSummaries: (userId) =>
        Ref.get(chats).pipe(
          Effect.map(
            flow(
              HashMap.filter(matches<Chat>({ userId })),
              HashMap.toValues,
              Arr.sort(byLatestActivity),
            ),
          ),
          Effect.flatMap(withActiveMessage),
        ),
      selectDetail: (where) =>
        Effect.map(readTables, (tables) =>
          HashMap.get(tables.chats, where.id).pipe(
            Option.filter(matches<Chat>(where)),
            Option.map(chatDetailOf(tables)),
          ),
        ),
      delete: (id) =>
        Effect.gen(function* () {
          const tables = yield* readTables
          if (hasBoundAttachment(tables, id)) {
            return yield* Effect.die(new Error(`chat ${id} has a message with a bound attachment`))
          }
          yield* Ref.update(chats, HashMap.remove(id))
          yield* Ref.update(
            messages,
            HashMap.filter(Predicate.not(matches<Message>({ chatId: id }))),
          )
        }),
    })
  }),
)

export const MessageRepositoryTest = Layer.effect(
  MessageRepository,
  Effect.gen(function* () {
    const messages = yield* MessageRows
    const readTables = yield* makeReadTables

    return MessageRepository.of({
      insert: (message) =>
        Ref.modify(messages, (rows) => {
          if (isActiveMessage(message) && Option.isSome(activeOf(rows, message.chatId))) {
            return [false, rows] as const
          }
          return [true, HashMap.set(rows, message.id, message)] as const
        }),
      update: (message, where) =>
        Ref.modify(messages, (rows) =>
          pipe(
            HashMap.get(rows, message.id),
            Option.filter(matches(where)),
            Option.match({
              onNone: () => [false, rows] as const,
              onSome: () => [true, HashMap.set(rows, message.id, message)] as const,
            }),
          ),
        ),
      selectOne: (where) =>
        Effect.map(readTables, (tables) =>
          HashMap.get(tables.messages, where.id).pipe(
            Option.filter(holdsMessageWhere(tables, where)),
          ),
        ),
      selectDetail: (where) =>
        Effect.map(readTables, (tables) =>
          HashMap.get(tables.messages, where.id).pipe(
            Option.filter(holdsMessageWhere(tables, where)),
            Option.map(detailOf(tables.attachments)),
          ),
        ),
      selectByChat: (chatId) =>
        Effect.map(readTables, (tables) =>
          Arr.map(messagesOf(tables.messages, chatId), detailOf(tables.attachments)),
        ),
      existsByChat: (chatId) =>
        Effect.map(Ref.get(messages), HashMap.some(matches<Message>({ chatId }))),
      selectActiveByChat: (chatId) =>
        Effect.map(Ref.get(messages), (rows) => activeOf(rows, chatId)),
    })
  }),
)
