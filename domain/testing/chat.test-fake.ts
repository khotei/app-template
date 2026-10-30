import {
  Array as Arr,
  Context,
  DateTime,
  Effect,
  HashMap,
  Layer,
  Option,
  Order,
  Predicate,
  pipe,
  Ref,
  UndefinedOr,
} from 'effect'
import { constTrue } from 'effect/Function'

import type { AttachmentId } from '#domain/attachment/attachment.id'
import type { Attachment } from '#domain/attachment/attachment.model'
import type { ChatId, MessageId } from '#domain/chat/chat.id'
import { Chat } from '#domain/chat/chat.model'
import { ChatRepository, type ChatWhere } from '#domain/chat/chat.port'
import { isActiveMessage, Message } from '#domain/chat/message.model'
import { MessageRepository, type MessageWhere } from '#domain/chat/message.port'
import { AttachmentRows } from '#domain/testing/attachment.test-fake'
import { matches, matchesAny, orDieOnNoRows, updateRow } from '#domain/testing/rows.test-util'
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

const newestFirst = Order.flip(Order.mapInput(DateTime.Order, (chat: Chat) => chat.createdAt))

const messagesOf = (messages: Messages, chatId: ChatId) =>
  pipe(
    messages,
    HashMap.filter(matches<Message>({ chatId })),
    HashMap.toValues,
    Arr.sort(inCreationOrder),
  )

/** The chat's active message, if any: the row the partial unique index guards. */
const activeOf = (messages: Messages, chatId: ChatId) =>
  pipe(messagesOf(messages, chatId), Arr.findFirst(isActiveMessage))

/** The message with the attachments bound to it, as the Pg relation reads them. */
const messageWithAttachmentsOf =
  (attachments: Attachments) =>
  (message: Message): Message =>
    new Message({
      ...message,
      attachments: pipe(
        attachments,
        HashMap.filter(matches<Attachment>({ messageId: Option.some(message.id) })),
        HashMap.toValues,
        Arr.sort(inCreationOrder),
      ),
    })

/** The chat with the attachments bound to its messages, as the Pg relation reads them. */
const chatWithAttachmentsOf =
  (attachments: Attachments) =>
  (chat: Chat): Chat =>
    new Chat({
      ...chat,
      attachments: pipe(
        attachments,
        HashMap.filter(matches<Attachment>({ chatId: Option.some(chat.id) })),
        HashMap.toValues,
        Arr.sort(inCreationOrder),
      ),
    })

interface Tables {
  readonly chats: Chats
  readonly messages: Messages
  readonly attachments: Attachments
}

/** Holds when the message's chat is the user's, as the Pg relation filter reads it. */
const isOwnedThroughChat = (
  chats: Chats,
  userId: UserId | undefined,
): Predicate.Predicate<Message> =>
  UndefinedOr.match(userId, {
    onUndefined: () => constTrue,
    onDefined: (owner) => (message: Message) =>
      HashMap.get(chats, message.chatId).pipe(Option.exists(matches<Chat>({ userId: owner }))),
  })

const holdsWhere = (tables: Tables, where: MessageWhere) =>
  Predicate.and(
    matches<Message>({ id: where.id, chatId: where.chatId }),
    Predicate.and(
      isOwnedThroughChat(tables.chats, where.userId),
      matchesAny<Message>({ status: where.status }),
    ),
  )

const createReadTables = Effect.gen(function* () {
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
    const attachments = yield* AttachmentRows

    const selectChat = (where: ChatWhere) =>
      Effect.all([Ref.get(chats), Ref.get(attachments)]).pipe(
        Effect.map(([rows, files]) =>
          HashMap.get(rows, where.id).pipe(
            Option.filter(matches<Chat>(where)),
            Option.map(chatWithAttachmentsOf(files)),
          ),
        ),
      )

    return ChatRepository.of({
      insert: (chat) => Ref.update(chats, HashMap.set(chat.id, chat)),
      update: (set, where) =>
        updateRow(chats, {
          id: where.id,
          where,
          update: (chat) => new Chat({ ...chat, ...set }),
        }).pipe(orDieOnNoRows(`chat ${where.id} was not updated`)),
      selectOne: selectChat,
      selectMany: (where) =>
        Effect.all([Ref.get(chats), Ref.get(attachments)]).pipe(
          Effect.map(([rows, files]) =>
            pipe(
              rows,
              HashMap.filter(matches<Chat>(where)),
              HashMap.toValues,
              Arr.sort(newestFirst),
              Arr.map(chatWithAttachmentsOf(files)),
            ),
          ),
        ),
      delete: (where) =>
        Effect.gen(function* () {
          yield* selectChat(where).pipe(
            Effect.map(Option.toArray),
            orDieOnNoRows(`chat ${where.id} was not deleted`),
          )

          // The cascade: the messages, then their attachments.
          yield* Ref.update(chats, HashMap.remove(where.id))
          yield* Ref.update(
            messages,
            HashMap.filter(Predicate.not(matches<Message>({ chatId: where.id }))),
          )
          yield* Ref.update(
            attachments,
            HashMap.filter(Predicate.not(matches<Attachment>({ chatId: Option.some(where.id) }))),
          )
        }),
    })
  }),
)

export const MessageRepositoryTest = Layer.effect(
  MessageRepository,
  Effect.gen(function* () {
    const messages = yield* MessageRows
    const readTables = yield* createReadTables

    const selectMany = (where: MessageWhere) =>
      readTables.pipe(
        Effect.map((tables) =>
          pipe(
            tables.messages,
            HashMap.filter(holdsWhere(tables, where)),
            HashMap.toValues,
            Arr.sort(inCreationOrder),
            Arr.map(messageWithAttachmentsOf(tables.attachments)),
          ),
        ),
      )

    return MessageRepository.of({
      insert: (message) =>
        Ref.modify(messages, (rows) => {
          if (isActiveMessage(message) && activeOf(rows, message.chatId).pipe(Option.isSome)) {
            return [Arr.empty<Message>(), rows] as const
          }
          return [Arr.of(message), HashMap.set(rows, message.id, message)] as const
        }).pipe(orDieOnNoRows(`message ${message.id} was not inserted`)),
      update: (message, where) =>
        updateRow(messages, { id: message.id, where, update: () => message }).pipe(
          orDieOnNoRows(`message ${message.id} was not updated`),
        ),
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
    })
  }),
)
