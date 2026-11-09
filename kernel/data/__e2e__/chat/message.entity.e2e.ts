import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { flipSqlError } from '@app-template/packages/db/testing/e2e'

import { chats } from '#kernel/data/chat/chat.table'
import type { MessageEntityInsert } from '#kernel/data/chat/message.entity'
import { messages, runs } from '#kernel/data/chat/message.table'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const createdAt = new Date('2026-10-18T00:00:00.123Z')

const userId = '0192d4e0-7b3a-7c00-8000-000000000060'
const chatId = '0192d4e0-7b3a-7c00-8000-000000000061'
const userMessageId = '0192d4e0-7b3a-7c00-8000-000000000062'
const runId = '0192d4e0-7b3a-7c00-8000-000000000063'

const message = (id: string, fields: Partial<typeof MessageEntityInsert.Type>) =>
  ({
    id,
    chatId,
    author: 'assistant',
    text: 'Hello',
    createdAt,
    ...fields,
  }) satisfies typeof MessageEntityInsert.Type

/** A chat with the user's message and its Run, which the assistant's message may name. */
const insertRun = Db.use((db) =>
  db
    .insert(users)
    .values({ id: userId, createdAt: new Date(0) })
    .pipe(
      Effect.andThen(
        db
          .insert(chats)
          .values({ id: chatId, userId, title: null, createdAt, updatedAt: createdAt }),
      ),
      Effect.andThen(
        db.insert(messages).values(message(userMessageId, { author: 'user', text: 'Hi' })),
      ),
      Effect.andThen(
        db.insert(runs).values({
          id: runId,
          chatId,
          userMessageId,
          status: 'done',
          provenance: { provider: 'anthropic', model: 'claude-haiku-5-5', instructionsHash: 'abc' },
          createdAt,
          updatedAt: createdAt,
        }),
      ),
    ),
)

const insertMessage = (row: typeof MessageEntityInsert.Type) =>
  Db.use((db) => db.insert(messages).values(row))

describe('messages', () => {
  it.effect.each([
    {
      name: 'an assistant message without a Run',
      row: message('0192d4e0-7b3a-7c00-8000-000000000064', {}),
    },
    {
      name: 'a user message with a Run',
      row: message('0192d4e0-7b3a-7c00-8000-000000000065', { author: 'user', runId }),
    },
  ])('refuses $name through messages_run_id_check', ({ row }) =>
    Effect.gen(function* () {
      yield* insertRun
      const error = yield* flipSqlError(insertMessage(row))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'messages_run_id_check')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect("accepts the assistant's message of a Run and refuses a second one of it", () =>
    Effect.gen(function* () {
      yield* insertRun
      yield* insertMessage(message('0192d4e0-7b3a-7c00-8000-000000000066', { runId }))
      const error = yield* flipSqlError(
        insertMessage(message('0192d4e0-7b3a-7c00-8000-000000000067', { runId })),
      )

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'messages_run_id_unique')
    }).pipe(Effect.provide(DbTest)),
  )
})
