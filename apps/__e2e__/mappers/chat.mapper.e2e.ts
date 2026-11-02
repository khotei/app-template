import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, pipe, Schema } from 'effect'

import {
  Chat,
  ChatFromEntity,
  ChatId,
  ChatStatus,
  ChatTitle,
  Message,
  MessageFromEntity,
  MessageId,
  MessageStatus,
  maxTitleLength,
} from '@app-template/application/chat'
import { owner } from '@app-template/application/chat/testing'
import {
  ChatEntityInsert,
  chats,
  Db,
  MessageEntityInsert,
  messages,
} from '@app-template/kernel/data'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { DbWithUsersTest } from '#testing/db.test-layer'

const chat = new Chat({
  id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000101'),
  userId: owner,
  title: Option.some(ChatTitle.make('a'.repeat(maxTitleLength))),
  status: 'idle',
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
  updatedAt: DateTime.makeUnsafe('2026-10-18T00:00:01.456Z'),
  attachments: [],
})

const message = new Message({
  id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000201'),
  chatId: chat.id,
  author: 'assistant',
  status: 'queued',
  text: 'hello',
  error: Option.none(),
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
  attachments: [],
})

const messageCases: ReadonlyArray<Pick<Message, 'author' | 'status'>> = [
  ...MessageStatus.literals.map((status) => ({ author: 'assistant' as const, status })),
  { author: 'user', status: 'done' },
]

describe('ChatFromEntity on Postgres', () => {
  it.effect.each(ChatStatus.literals.map((status) => ({ status })))(
    '$status: writes a title of the maximum length and reads it back',
    ({ status }) =>
      Effect.gen(function* () {
        const db = yield* Db
        const written = new Chat({ ...chat, status })
        const row = pipe(
          written,
          Schema.encodeSync(ChatFromEntity),
          Schema.decodeSync(ChatEntityInsert),
        )

        yield* db.insert(chats).values(row)
        const selected = yield* db.query.chats
          .findFirst({ where: { id: chat.id }, with: { attachments: true } })
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ChatFromEntity)))

        assertSchemaEquals(Chat, selected, written)
      }).pipe(Effect.provide(DbWithUsersTest)),
  )
})

describe('MessageFromEntity on Postgres', () => {
  it.effect.each(messageCases)(
    '$status: writes a message by the $author and reads it back',
    ({ author, status }) =>
      Effect.gen(function* () {
        const db = yield* Db
        const parent = pipe(
          chat,
          Schema.encodeSync(ChatFromEntity),
          Schema.decodeSync(ChatEntityInsert),
        )
        const written = new Message({ ...message, author, status })
        const row = pipe(
          written,
          Schema.encodeSync(MessageFromEntity),
          Schema.decodeSync(MessageEntityInsert),
        )

        yield* db.insert(chats).values(parent)
        yield* db.insert(messages).values(row)
        const selected = yield* db.query.messages
          .findFirst({ where: { id: message.id }, with: { attachments: true } })
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(MessageFromEntity)))

        assertSchemaEquals(Message, selected, written)
      }).pipe(Effect.provide(DbWithUsersTest)),
  )
})
