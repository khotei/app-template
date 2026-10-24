import { assert, describe, it } from '@effect/vitest'
import { and, asc, eq } from 'drizzle-orm'
import { DateTime, Effect, Option, Schema } from 'effect'

import { AttachmentId } from '@app-template/domain/attachment'
import { Chat, ChatId, Message, MessageFailure, MessageId } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { activeMessage, messages } from '#infrastructure/chat/message.entity'
import { Db } from '#infrastructure/db/db.client'
import { DbTest, flipSqlError } from '#infrastructure/db/testing/db'
import {
  decodeChat,
  decodeMessage,
  insertChat,
  insertMessage,
  insertUser,
} from '#infrastructure/db/testing/rows'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')
const updatedAt = DateTime.makeUnsafe('2026-10-18T00:00:01.456Z')

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000060')
const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000061')

const chat = new Chat({ id: chatId, userId, title: Option.none(), createdAt, updatedAt })

const message = (
  id: MessageId,
  fields: Partial<Pick<Message, 'author' | 'stage' | 'text' | 'attachmentIds' | 'error'>>,
) =>
  new Message({
    id,
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

const failure = new MessageFailure({
  reason: 'ReplyFailed',
  message: 'The assistant could not reply.',
  cause: 'provider timeout after 30s',
})

const insertChatOfUser = Effect.andThen(insertUser(userId), insertChat(chat))

const selectMessages = Effect.gen(function* () {
  const db = yield* Db
  const rows = yield* db.select().from(messages).orderBy(asc(messages.id))
  return yield* Effect.forEach(rows, decodeMessage)
})

const ChatWithMessages = Schema.Struct({ chat: Chat, messages: Schema.Array(Message) })

describe('messages', () => {
  it.effect.each([
    {
      name: 'a queued reply',
      message: message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000070'), {}),
    },
    {
      name: 'a preparing reply',
      message: message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000071'), {
        stage: 'preparing',
      }),
    },
    {
      name: 'a generating reply',
      message: message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000072'), {
        stage: 'generating',
        text: 'Lis',
      }),
    },
    {
      name: 'a completed reply',
      message: message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000073'), {
        stage: 'completed',
        text: 'Lisbon',
      }),
    },
    {
      name: 'a failed reply with its cause',
      message: message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000074'), {
        stage: 'failed',
        error: Option.some(failure),
      }),
    },
    {
      name: 'a user message with two attachments',
      message: message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000075'), {
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
      yield* insertChatOfUser
      yield* insertMessage(message)
      const selected = yield* selectMessages

      assertSchemaEquals(Schema.Array(Message), selected, [message])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('refuses a second active reply in a chat through the partial unique index', () =>
    Effect.gen(function* () {
      const queued = message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000076'), {})
      const generating = message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000077'), {
        stage: 'generating',
      })

      yield* insertChatOfUser
      yield* insertMessage(queued)
      const error = yield* flipSqlError(insertMessage(generating))

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'messages_chat_id_active_index')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('accepts an active reply beside a completed one', () =>
    Effect.gen(function* () {
      const completed = message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000078'), {
        stage: 'completed',
      })
      const queued = message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000079'), {})

      yield* insertChatOfUser
      yield* insertMessage(completed)
      yield* insertMessage(queued)
      const selected = yield* selectMessages

      assertSchemaEquals(Schema.Array(Message), selected, [completed, queued])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('renders the active predicate as literals, so a query matches the index', () =>
    Effect.gen(function* () {
      const db = yield* Db

      const query = db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.chatId, chatId), activeMessage))
        .toSQL()

      assert.include(
        query.sql,
        `"messages"."author" = 'assistant' and "messages"."stage" in ('queued', 'preparing', 'generating')`,
      )
      assert.deepStrictEqual(query.params, [chatId])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('nests a chat’s messages under it in a relational query', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const question = message(MessageId.make('0192d4e0-7b3a-7c00-8000-00000000007a'), {
        author: 'user',
        stage: 'completed',
        text: 'Plan a trip',
      })
      const reply = message(MessageId.make('0192d4e0-7b3a-7c00-8000-00000000007b'), {})

      yield* insertChatOfUser
      yield* insertMessage(question)
      yield* insertMessage(reply)
      const rows = yield* db.query.chats.findMany({
        with: { messages: { orderBy: { id: 'asc' } } },
      })
      const found = yield* Effect.forEach(rows, ({ messages, ...row }) =>
        Effect.all({ chat: decodeChat(row), messages: Effect.forEach(messages, decodeMessage) }),
      )

      assertSchemaEquals(Schema.Array(ChatWithMessages), found, [
        { chat, messages: [question, reply] },
      ])
    }).pipe(Effect.provide(DbTest)),
  )
})
