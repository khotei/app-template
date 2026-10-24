import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import { Chat, ChatId, ChatTitle, maxTitleLength } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { ChatInsert, chats, decodeChat } from '#infrastructure/chat/chat.entity'
import { Db } from '#infrastructure/db/db.client'
import { DbTest, flipSqlError } from '#infrastructure/db/testing/db'
import { insertChat, insertUser } from '#infrastructure/db/testing/rows'

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000060')

const chat = (title: Option.Option<ChatTitle>) =>
  new Chat({
    id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000061'),
    userId,
    title,
    createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
    updatedAt: DateTime.makeUnsafe('2026-10-18T00:00:01.456Z'),
  })

const selectChats = Effect.gen(function* () {
  const db = yield* Db
  const rows = yield* db.select().from(chats)
  return yield* Effect.forEach(rows, decodeChat)
})

describe('chats', () => {
  it.effect.each([
    { name: 'with a title', title: Option.some(ChatTitle.make('Trip to Lisbon')) },
    { name: 'without a title', title: Option.none() },
  ])('reads a chat $name back as the model it was written from', ({ title }) =>
    Effect.gen(function* () {
      yield* insertUser(userId)
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

      yield* insertUser(userId)
      const error = yield* flipSqlError(db.insert(chats).values({ ...row, title }))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'chats_title_check')
    }).pipe(Effect.provide(DbTest)),
  )
})
