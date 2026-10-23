import { assert, describe, it } from '@effect/vitest'
import { asc } from 'drizzle-orm'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { DateTime, Effect, Option, Schema } from 'effect'

import { AttachmentId } from '@app-template/domain/attachment'
import {
  Chat,
  ChatId,
  ChatTitle,
  Message,
  MessageFailure,
  MessageId,
  maxTitleLength,
} from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { ChatInsert, ChatRow, chats } from '#infrastructure/chat/chat.entity'
import { MessageInsert, MessageRow, messages } from '#infrastructure/chat/message.entity'
import { Db, unwrapQueryError } from '#infrastructure/db/db.client'
import { DbTest } from '#infrastructure/db/testing/db'
import { users } from '#infrastructure/user/user.entity'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')
const updatedAt = DateTime.makeUnsafe('2026-10-18T00:00:01.456Z')

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000060')
const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000061')

const chat = (title: Option.Option<ChatTitle>) =>
  new Chat({ id: chatId, userId, title, createdAt, updatedAt })

const message = (
  id: string,
  fields: Partial<Pick<Message, 'author' | 'stage' | 'text' | 'attachmentIds' | 'error'>>,
) =>
  new Message({
    id: MessageId.make(id),
    chatId,
    author: 'assistant',
    stage: 'queued',
    text: '',
    attachmentIds: [],
    error: Option.none(),
    createdAt,
    updatedAt,
    ...fields,
  })

const insertUser = Effect.flatMap(Db, (db) =>
  db.insert(users).values({ id: userId, createdAt: new Date(0) }),
)

const insertChat = (chat: Chat) =>
  Effect.flatMap(Db, (db) => db.insert(chats).values(Schema.encodeSync(ChatInsert)(chat)))

const insertMessage = (message: Message) =>
  Effect.flatMap(Db, (db) => db.insert(messages).values(Schema.encodeSync(MessageInsert)(message)))

const decodeChat = (row: typeof ChatRow.Encoded) =>
  Effect.map(Schema.decodeEffect(ChatRow)(row), (fields) => new Chat(fields))

const decodeMessage = (row: typeof MessageRow.Encoded) =>
  Effect.map(Schema.decodeEffect(MessageRow)(row), (fields) => new Message(fields))

const selectChats = Effect.gen(function* () {
  const db = yield* Db
  const rows = yield* db.select().from(chats)
  return yield* Effect.forEach(rows, decodeChat)
})

const selectMessages = Effect.gen(function* () {
  const db = yield* Db
  const rows = yield* db.select().from(messages).orderBy(asc(messages.id))
  return yield* Effect.forEach(rows, decodeMessage)
})

const ChatWithMessages = Schema.Struct({ chat: Chat, messages: Schema.Array(Message) })

const flipSqlError = <A, R>(self: Effect.Effect<A, EffectDrizzleQueryError, R>) =>
  Effect.flip(self.pipe(Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError)))

describe('chats', () => {
  it.effect.each([
    { name: 'with a title', title: Option.some(ChatTitle.make('Trip to Lisbon')) },
    { name: 'without a title', title: Option.none() },
  ])('reads a chat $name back as the model it was written from', ({ title }) =>
    Effect.gen(function* () {
      yield* insertUser
      yield* insertChat(chat(title))
      const selected = yield* selectChats

      assertSchemaEquals(Schema.Array(Chat), selected, [chat(title)])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect.each([
    { name: 'longer than the maximum', title: 'a'.repeat(maxTitleLength + 1) },
    { name: 'empty', title: '' },
    { name: 'untrimmed', title: ' Trip' },
  ])('refuses a title that is $name through its check', ({ title }) =>
    Effect.gen(function* () {
      const db = yield* Db
      const row = Schema.encodeSync(ChatInsert)(chat(Option.none()))

      yield* insertUser
      const error = yield* flipSqlError(db.insert(chats).values({ ...row, title }))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'chats_title_check')
    }).pipe(Effect.provide(DbTest)),
  )
})

const failure = new MessageFailure({
  reason: 'ReplyFailed',
  message: 'The assistant could not reply.',
  cause: 'provider timeout after 30s',
})

describe('messages', () => {
  it.effect.each([
    { name: 'a queued reply', message: message('0192d4e0-7b3a-7c00-8000-000000000070', {}) },
    {
      name: 'a preparing reply',
      message: message('0192d4e0-7b3a-7c00-8000-000000000071', { stage: 'preparing' }),
    },
    {
      name: 'a generating reply',
      message: message('0192d4e0-7b3a-7c00-8000-000000000072', {
        stage: 'generating',
        text: 'Lis',
      }),
    },
    {
      name: 'a completed reply',
      message: message('0192d4e0-7b3a-7c00-8000-000000000073', {
        stage: 'completed',
        text: 'Lisbon',
      }),
    },
    {
      name: 'a failed reply with its cause',
      message: message('0192d4e0-7b3a-7c00-8000-000000000074', {
        stage: 'failed',
        error: Option.some(failure),
      }),
    },
    {
      name: 'a user message with two attachments',
      message: message('0192d4e0-7b3a-7c00-8000-000000000075', {
        author: 'user',
        stage: 'completed',
        text: 'Plan a trip',
        attachmentIds: [
          AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000081'),
          AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000080'),
        ],
      }),
    },
  ])('reads $name back as the model it was written from', ({ message }) =>
    Effect.gen(function* () {
      yield* insertUser
      yield* insertChat(chat(Option.none()))
      yield* insertMessage(message)
      const selected = yield* selectMessages

      assertSchemaEquals(Schema.Array(Message), selected, [message])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('refuses a second active reply in a chat through the partial unique index', () =>
    Effect.gen(function* () {
      yield* insertUser
      yield* insertChat(chat(Option.none()))
      yield* insertMessage(message('0192d4e0-7b3a-7c00-8000-000000000076', {}))
      const error = yield* flipSqlError(
        insertMessage(message('0192d4e0-7b3a-7c00-8000-000000000077', { stage: 'generating' })),
      )

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'messages_one_active_per_chat')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('accepts an active reply beside a completed one', () =>
    Effect.gen(function* () {
      const completed = message('0192d4e0-7b3a-7c00-8000-000000000078', { stage: 'completed' })
      const queued = message('0192d4e0-7b3a-7c00-8000-000000000079', {})

      yield* insertUser
      yield* insertChat(chat(Option.none()))
      yield* insertMessage(completed)
      yield* insertMessage(queued)
      const selected = yield* selectMessages

      assertSchemaEquals(Schema.Array(Message), selected, [completed, queued])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('nests a chat’s messages under it in a relational query', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const question = message('0192d4e0-7b3a-7c00-8000-00000000007a', {
        author: 'user',
        stage: 'completed',
        text: 'Plan a trip',
      })
      const reply = message('0192d4e0-7b3a-7c00-8000-00000000007b', {})

      yield* insertUser
      yield* insertChat(chat(Option.none()))
      yield* insertMessage(question)
      yield* insertMessage(reply)
      const rows = yield* db.query.chats.findMany({
        with: { messages: { orderBy: { id: 'asc' } } },
      })
      const found = yield* Effect.forEach(rows, ({ messages, ...row }) =>
        Effect.all({ chat: decodeChat(row), messages: Effect.forEach(messages, decodeMessage) }),
      )

      assertSchemaEquals(Schema.Array(ChatWithMessages), found, [
        { chat: chat(Option.none()), messages: [question, reply] },
      ])
    }).pipe(Effect.provide(DbTest)),
  )
})
