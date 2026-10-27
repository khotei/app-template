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
} from 'effect'

import type { AttachmentId } from '#domain/attachment/attachment.id'
import type { Attachment } from '#domain/attachment/attachment.model'
import type { ChatId, MessageId } from '#domain/chat/chat.id'
import { Chat, type ChatDetail, type ChatSummary } from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import {
  isActiveMessage,
  isInChat,
  type Message,
  type MessageDetail,
} from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import { isOwnedBy } from '#domain/shared/guard'
import { AttachmentRows } from '#domain/testing/attachment.fake'
import { matches } from '#domain/testing/rows'

/** The rows `ChatRepositoryMemory` keeps, by id, for a test to arrange or read. */
export class ChatRows extends Context.Service<ChatRows, Ref.Ref<HashMap.HashMap<ChatId, Chat>>>()(
  '@app-template/domain/testing/ChatRows',
) {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<ChatId, Chat>()))
}

/** The rows `MessageRepositoryMemory` keeps, by id, for a test to arrange or read. */
export class MessageRows extends Context.Service<
  MessageRows,
  Ref.Ref<HashMap.HashMap<MessageId, Message>>
>()('@app-template/domain/testing/MessageRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<MessageId, Message>()))
}

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

const byLatestActivity: Order.Order<Chat> = (self, that) =>
  DateTime.Order(that.updatedAt, self.updatedAt)

const messagesOf = (messages: Messages, chatId: ChatId) =>
  pipe(messages, HashMap.filter(isInChat(chatId)), HashMap.toValues, Arr.sort(inCreationOrder))

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

export const ChatRepositoryMemory = Layer.effect(
  ChatRepository,
  Effect.gen(function* () {
    const chats = yield* ChatRows
    const messages = yield* MessageRows
    const attachments = yield* AttachmentRows

    const summaryOf = (chat: Chat) =>
      Effect.map(
        Ref.get(messages),
        (rows): ChatSummary => ({ chat, activeMessage: activeOf(rows, chat.id) }),
      )

    const chatDetailOf = (chat: Chat) =>
      Effect.gen(function* () {
        const summary = yield* summaryOf(chat)
        const messageRows = yield* Ref.get(messages)
        const attachmentRows = yield* Ref.get(attachments)
        const details = Arr.map(messagesOf(messageRows, chat.id), detailOf(attachmentRows))
        return { ...summary, messages: details } satisfies ChatDetail
      })

    const hasBoundAttachment = (chatId: ChatId) =>
      Effect.gen(function* () {
        const messageRows = yield* Ref.get(messages)
        const attachmentRows = yield* Ref.get(attachments)
        return Arr.some(messagesOf(messageRows, chatId), (message) =>
          HashMap.some(attachmentRows, isBoundTo(message.id)),
        )
      })

    return ChatRepository.of({
      insert: (chat) => Ref.update(chats, HashMap.set(chat.id, chat)),
      update: (set, where) =>
        Ref.modify(chats, (rows) =>
          pipe(
            HashMap.get(rows, where.id),
            Option.filter(matches(where)),
            Option.match({
              onNone: () => [false, rows] as const,
              onSome: (chat) =>
                [true, HashMap.set(rows, chat.id, new Chat({ ...chat, ...set }))] as const,
            }),
          ),
        ),
      selectById: (id) => Effect.map(Ref.get(chats), HashMap.get(id)),
      selectSummaries: (userId) =>
        Effect.flatMap(Ref.get(chats), (rows) =>
          pipe(
            rows,
            HashMap.filter(isOwnedBy(userId)),
            HashMap.toValues,
            Arr.sort(byLatestActivity),
            Effect.forEach(summaryOf),
          ),
        ),
      selectDetail: (id) =>
        Effect.flatMap(Ref.get(chats), (rows) =>
          Option.match(HashMap.get(rows, id), {
            onNone: () => Effect.succeedNone,
            onSome: (chat) => Effect.map(chatDetailOf(chat), Option.some),
          }),
        ),
      delete: (id) =>
        Effect.gen(function* () {
          const bound = yield* hasBoundAttachment(id)
          if (bound) {
            return yield* Effect.die(new Error(`chat ${id} has a message with a bound attachment`))
          }
          yield* Ref.update(chats, HashMap.remove(id))
          yield* Ref.update(messages, HashMap.filter(Predicate.not(isInChat(id))))
        }),
    })
  }),
)

export const MessageRepositoryMemory = Layer.effect(
  MessageRepository,
  Effect.gen(function* () {
    const messages = yield* MessageRows
    const attachments = yield* AttachmentRows

    const withAttachments = (found: ReadonlyArray<Message>) =>
      Effect.map(Ref.get(attachments), (rows) => Arr.map(found, detailOf(rows)))

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
      selectById: (id) => Effect.map(Ref.get(messages), HashMap.get(id)),
      selectDetail: (id) =>
        Effect.flatMap(Ref.get(messages), (rows) =>
          Effect.map(withAttachments(Arr.fromOption(HashMap.get(rows, id))), Arr.head),
        ),
      selectByChat: (chatId) =>
        Effect.flatMap(Ref.get(messages), (rows) => withAttachments(messagesOf(rows, chatId))),
      existsByChat: (chatId) => Effect.map(Ref.get(messages), HashMap.some(isInChat(chatId))),
      selectActiveByChat: (chatId) =>
        Effect.map(Ref.get(messages), (rows) => activeOf(rows, chatId)),
    })
  }),
)
