import { assert, describe, it } from '@effect/vitest'
import { Effect, Schema, type Types } from 'effect'

import { flipSqlError } from '@app-template/packages/db/testing/e2e'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'
import { RunColumns, runs } from '#kernel/data/chat/run.table'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const createdAt = new Date('2026-11-09T00:00:00.123Z')
const updatedAt = new Date('2026-11-09T00:00:01.456Z')

const userId = '0192d4e0-7b3a-7c00-8000-000000000090'
const strangerId = '0192d4e0-7b3a-7c00-8000-00000000008f'
const chatId = '0192d4e0-7b3a-7c00-8000-000000000091'
const userMessageId = '0192d4e0-7b3a-7c00-8000-000000000092'
const otherChatId = '0192d4e0-7b3a-7c00-8000-00000000009a'
const replyId = '0192d4e0-7b3a-7c00-8000-00000000009b'

const usage = {
  model: 'claude-sonnet-5-5',
  promptTokens: 130,
  outputTokens: 5,
  cacheReadTokens: 100,
  cacheWriteTokens: 20,
} as const

type RunRow = RunColumns

const run = (
  id: string,
  fields: Types.Simplify<
    Partial<
      Pick<RunRow, 'chatId' | 'userId' | 'status' | 'failure' | 'assistantMessageId' | 'usage'>
    >
  > = {},
): RunRow => ({
  id,
  chatId,
  userId,
  userMessageId,
  status: 'queued',
  failure: null,
  assistantMessageId: null,
  usage: null,
  createdAt,
  updatedAt,
  ...fields,
})

/**
 * Two chats of one user, the first with the user's message and an assistant's reply, beside a
 * stranger with no chat.
 */
const insertMessages = Effect.gen(function* () {
  const db = yield* Db

  yield* db.insert(users).values([
    { id: userId, createdAt: new Date(0) },
    { id: strangerId, createdAt: new Date(0) },
  ])
  yield* db.insert(chats).values([
    { id: chatId, userId, title: null, createdAt, updatedAt },
    { id: otherChatId, userId, title: null, createdAt, updatedAt },
  ])
  yield* db.insert(messages).values([
    { id: userMessageId, chatId, userId, author: 'user', text: 'Hi', createdAt },
    { id: replyId, chatId, userId, author: 'assistant', text: 'Hello', createdAt },
  ])
})

const insertRun = Effect.fnUntraced(function* (row: RunRow) {
  const db = yield* Db
  return yield* db.insert(runs).values(row)
})

const selectRuns = Effect.gen(function* () {
  const db = yield* Db
  const rows = yield* db.select().from(runs).orderBy(runs.id)
  return yield* Schema.decodeEffect(Schema.Array(RunColumns))(rows)
})

describe('runs', () => {
  it.effect('reads back a queued Run beside a done one of the same message', () =>
    Effect.gen(function* () {
      const done = run('0192d4e0-7b3a-7c00-8000-000000000093', {
        status: 'done',
        assistantMessageId: replyId,
        usage,
      })
      const queued = run('0192d4e0-7b3a-7c00-8000-000000000094')

      yield* insertMessages
      yield* insertRun(done)
      yield* insertRun(queued)
      const selected = yield* selectRuns

      assertSchemaEquals(Schema.Array(RunColumns), selected, [done, queued])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('refuses a second active Run in a chat through the partial unique index', () =>
    Effect.gen(function* () {
      yield* insertMessages
      yield* insertRun(run('0192d4e0-7b3a-7c00-8000-000000000095'))
      const error = yield* flipSqlError(
        insertRun(run('0192d4e0-7b3a-7c00-8000-000000000096', { status: 'generating' })),
      )

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'runs_chat_id_active_index')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect.each([
    {
      name: 'a done Run without its reply',
      row: { status: 'done', usage },
      check: 'runs_assistant_message_id_check',
    },
    {
      name: 'a queued Run naming a reply',
      row: { assistantMessageId: replyId },
      check: 'runs_assistant_message_id_check',
    },
    {
      name: 'a done Run without its usage',
      row: { status: 'done', assistantMessageId: replyId },
      check: 'runs_usage_check',
    },
    {
      name: 'a queued Run holding a usage',
      row: { usage },
      check: 'runs_usage_check',
    },
    {
      name: 'a failed Run without its failure',
      row: { status: 'failed' },
      check: 'runs_failure_check',
    },
  ] as const)('refuses $name through $check', ({ row, check }) =>
    Effect.gen(function* () {
      yield* insertMessages
      const error = yield* flipSqlError(insertRun(run('0192d4e0-7b3a-7c00-8000-000000000097', row)))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), check)
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('refuses a second Run naming the same reply', () =>
    Effect.gen(function* () {
      const done = { status: 'done', assistantMessageId: replyId, usage } as const
      yield* insertMessages
      yield* insertRun(run('0192d4e0-7b3a-7c00-8000-000000000098', done))
      const error = yield* flipSqlError(
        insertRun(run('0192d4e0-7b3a-7c00-8000-000000000099', done)),
      )

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'runs_assistant_message_id_unique')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect("refuses a Run in another chat than its message's through the key over both", () =>
    Effect.gen(function* () {
      yield* insertMessages
      const error = yield* flipSqlError(
        insertRun(run('0192d4e0-7b3a-7c00-8000-00000000009c', { chatId: otherChatId })),
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'runs_user_message_id_chat_id_fk')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('refuses a Run in a chat no row holds through its key', () =>
    Effect.gen(function* () {
      yield* insertMessages
      const error = yield* flipSqlError(
        insertRun(
          run('0192d4e0-7b3a-7c00-8000-00000000009d', {
            chatId: '0192d4e0-7b3a-7c00-8000-00000000009f',
          }),
        ),
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'runs_chat_id_user_id_fk')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect("refuses a Run of another user than its chat's through the key over both", () =>
    Effect.gen(function* () {
      yield* insertMessages
      const error = yield* flipSqlError(
        insertRun(run('0192d4e0-7b3a-7c00-8000-00000000008e', { userId: strangerId })),
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'runs_chat_id_user_id_fk')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('refuses a done Run naming a reply no row holds through its key', () =>
    Effect.gen(function* () {
      yield* insertMessages
      const error = yield* flipSqlError(
        insertRun(
          run('0192d4e0-7b3a-7c00-8000-00000000009e', {
            status: 'done',
            assistantMessageId: '0192d4e0-7b3a-7c00-8000-0000000000a0',
            usage,
          }),
        ),
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'runs_assistant_message_id_messages_id_fkey')
    }).pipe(Effect.provide(DbTest)),
  )
})
