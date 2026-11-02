import { assert, describe, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'

import { flipSqlError } from '@app-template/packages/db/testing-e2e'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { chats } from '#kernel/data/chat/chat.table'
import { MessageEntity, withAttachments } from '#kernel/data/chat/message.entity'
import { messages } from '#kernel/data/chat/message.table'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing-e2e/data/db.test-layer'

const createdAt = new Date('2026-10-18T00:00:00.123Z')
const updatedAt = new Date('2026-10-18T00:00:01.456Z')

const userId = '0192d4e0-7b3a-7c00-8000-000000000060'
const chatId = '0192d4e0-7b3a-7c00-8000-000000000061'

const message = (id: string, fields: Partial<Pick<MessageEntity, 'status'>>): MessageEntity => ({
  id,
  chatId,
  author: 'assistant',
  status: 'queued',
  text: '',
  error: null,
  createdAt,
  updatedAt,
  attachments: [],
  ...fields,
})

const insertChatOfUser = Db.use((db) =>
  db
    .insert(users)
    .values({ id: userId, createdAt: new Date(0) })
    .pipe(
      Effect.andThen(
        db.insert(chats).values({ id: chatId, userId, title: null, createdAt, updatedAt }),
      ),
    ),
)

const insertMessage = ({ attachments: _, ...row }: MessageEntity) =>
  Db.use((db) => db.insert(messages).values(row))

const selectMessages = Db.use((db) =>
  db.query.messages.findMany({ orderBy: { id: 'asc' }, with: withAttachments }),
).pipe(Effect.flatMap(Schema.decodeEffect(Schema.Array(MessageEntity))))

describe('messages', () => {
  it.effect('refuses a second active reply in a chat through the partial unique index', () =>
    Effect.gen(function* () {
      const queued = message('0192d4e0-7b3a-7c00-8000-000000000076', {})
      const generating = message('0192d4e0-7b3a-7c00-8000-000000000077', {
        status: 'generating',
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
      const completed = message('0192d4e0-7b3a-7c00-8000-000000000078', { status: 'done' })
      const queued = message('0192d4e0-7b3a-7c00-8000-000000000079', {})

      yield* insertChatOfUser
      yield* insertMessage(completed)
      yield* insertMessage(queued)
      const selected = yield* selectMessages

      assertSchemaEquals(Schema.Array(MessageEntity), selected, [completed, queued])
    }).pipe(Effect.provide(DbTest)),
  )
})
