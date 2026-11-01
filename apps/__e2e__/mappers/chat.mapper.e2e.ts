import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, pipe, Schema } from 'effect'

import { Chat, ChatId, ChatTitle, maxTitleLength } from '@app-template/chat/domain'
import { owner } from '@app-template/chat/testing'
import { ChatFromEntity } from '@app-template/infrastructure/chat'
import { Db } from '@app-template/kernel/data'
import { ChatEntityInsert, chats } from '@app-template/kernel/data/chat'
import { assertSchemaEquals } from '@app-template/testing'

import { DbWithUsersTest } from '#testing-e2e/db.test-layer'

const chat = new Chat({
  id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000101'),
  userId: owner,
  title: Option.some(ChatTitle.make('a'.repeat(maxTitleLength))),
  status: 'idle',
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
  updatedAt: DateTime.makeUnsafe('2026-10-18T00:00:01.456Z'),
  attachments: [],
})

describe('ChatFromEntity on Postgres', () => {
  it.effect('writes a title of the maximum length and reads it back', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const row = pipe(chat, Schema.encodeSync(ChatFromEntity), Schema.decodeSync(ChatEntityInsert))

      yield* db.insert(chats).values(row)
      const selected = yield* db.query.chats
        .findFirst({ where: { id: chat.id }, with: { attachments: true } })
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ChatFromEntity)))

      assertSchemaEquals(Chat, selected, chat)
    }).pipe(Effect.provide(DbWithUsersTest)),
  )
})
