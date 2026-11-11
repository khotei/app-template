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
const chatId = '0192d4e0-7b3a-7c00-8000-000000000091'
const userMessageId = '0192d4e0-7b3a-7c00-8000-000000000092'
const otherChatId = '0192d4e0-7b3a-7c00-8000-00000000009a'
const replyId = '0192d4e0-7b3a-7c00-8000-00000000009b'

type RunRow = RunColumns

const run = (
  id: string,
  fields: Types.Simplify<
    Partial<Pick<RunRow, 'chatId' | 'status' | 'failure' | 'assistantMessageId'>>
  > = {},
): RunRow => ({
  id,
  chatId,
  userMessageId,
  status: 'queued',
  failure: null,
  provenance: { provider: 'anthropic', model: 'claude-haiku-5-5', instructionsHash: 'abc' },
  assistantMessageId: null,
  createdAt,
  updatedAt,
  ...fields,
})

/** Two chats of one user, the first with the user's message and an assistant's reply. */
const insertMessages = Db.use((db) =>
  db
    .insert(users)
    .values({ id: userId, createdAt: new Date(0) })
    .pipe(
      Effect.andThen(
        db.insert(chats).values([
          { id: chatId, userId, title: null, createdAt, updatedAt },
          { id: otherChatId, userId, title: null, createdAt, updatedAt },
        ]),
      ),
      Effect.andThen(
        db.insert(messages).values([
          { id: userMessageId, chatId, author: 'user', text: 'Hi', createdAt },
          { id: replyId, chatId, author: 'assistant', text: 'Hello', createdAt },
        ]),
      ),
    ),
)

const insertRun = (row: RunRow) => Db.use((db) => db.insert(runs).values(row))

const selectRuns = Db.use((db) => db.select().from(runs).orderBy(runs.id)).pipe(
  Effect.flatMap(Schema.decodeEffect(Schema.Array(RunColumns))),
)

describe('runs', () => {
  it.effect('reads back a queued Run beside a done one of the same message', () =>
    Effect.gen(function* () {
      const done = run('0192d4e0-7b3a-7c00-8000-000000000093', {
        status: 'done',
        assistantMessageId: replyId,
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
      row: { status: 'done' },
      check: 'runs_assistant_message_id_check',
    },
    {
      name: 'a queued Run naming a reply',
      row: { assistantMessageId: replyId },
      check: 'runs_assistant_message_id_check',
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
      const done = { status: 'done', assistantMessageId: replyId } as const
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
})
