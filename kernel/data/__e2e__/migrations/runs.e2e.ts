import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'

import { PgClientTest } from '@app-template/packages/db/testing/e2e'

const createdAt = new Date('2026-11-09T00:00:00.123Z')
const updatedAt = new Date('2026-11-09T00:00:01.456Z')

const userId = '0192d4e0-7b3a-7c00-8000-000000000090'
const chatId = '0192d4e0-7b3a-7c00-8000-000000000091'
const userMessageId = '0192d4e0-7b3a-7c00-8000-000000000092'
const otherChatId = '0192d4e0-7b3a-7c00-8000-00000000009a'
const replyId = '0192d4e0-7b3a-7c00-8000-00000000009b'

interface RunRow {
  readonly id: string
  readonly chatId: string
  readonly userMessageId: string
  readonly status: string
  readonly failure: { readonly cause: string } | null
  readonly assistantMessageId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

const run = (id: string, fields: Partial<RunRow> = {}): RunRow => ({
  id,
  chatId,
  userMessageId,
  status: 'queued',
  failure: null,
  assistantMessageId: null,
  createdAt,
  updatedAt,
  ...fields,
})

/** Two chats of one user, the first with the user's message and an assistant's reply. */
const insertMessages = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`insert into users ${sql.insert({ id: userId, createdAt: new Date(0) })}`
  yield* sql`insert into chats ${sql.insert([
    { id: chatId, userId, title: null, createdAt, updatedAt },
    { id: otherChatId, userId, title: null, createdAt, updatedAt },
  ])}`
  yield* sql`insert into messages ${sql.insert([
    { id: userMessageId, chatId, author: 'user', text: 'Hi', createdAt },
    { id: replyId, chatId, author: 'assistant', text: 'Hello', createdAt },
  ])}`
})

// `failure` as JSON text, which Postgres reads into its `jsonb`.
const insertRun = (row: RunRow) =>
  SqlClient.SqlClient.use(
    (sql) =>
      sql`insert into runs ${sql.insert({
        ...row,
        failure: row.failure === null ? null : JSON.stringify(row.failure),
      })}`,
  )

const selectRuns = SqlClient.SqlClient.use((sql) => sql<RunRow>`select * from runs order by id`)

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

      assert.deepStrictEqual(yield* selectRuns, [done, queued])
    }).pipe(Effect.provide(PgClientTest)),
  )

  it.effect('refuses a second active Run in a chat through the partial unique index', () =>
    Effect.gen(function* () {
      yield* insertMessages
      yield* insertRun(run('0192d4e0-7b3a-7c00-8000-000000000095'))
      const error = yield* insertRun(
        run('0192d4e0-7b3a-7c00-8000-000000000096', { status: 'generating' }),
      ).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'runs_chat_id_active_index')
    }).pipe(Effect.provide(PgClientTest)),
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
      const error = yield* insertRun(run('0192d4e0-7b3a-7c00-8000-000000000097', row)).pipe(
        Effect.flip,
      )

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), check)
    }).pipe(Effect.provide(PgClientTest)),
  )

  it.effect('refuses a second Run naming the same reply', () =>
    Effect.gen(function* () {
      const done = { status: 'done', assistantMessageId: replyId } as const
      yield* insertMessages
      yield* insertRun(run('0192d4e0-7b3a-7c00-8000-000000000098', done))
      const error = yield* insertRun(run('0192d4e0-7b3a-7c00-8000-000000000099', done)).pipe(
        Effect.flip,
      )

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'runs_assistant_message_id_unique')
    }).pipe(Effect.provide(PgClientTest)),
  )

  it.effect("refuses a Run in another chat than its message's through the key over both", () =>
    Effect.gen(function* () {
      yield* insertMessages
      const error = yield* insertRun(
        run('0192d4e0-7b3a-7c00-8000-00000000009c', { chatId: otherChatId }),
      ).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'runs_user_message_id_chat_id_fk')
    }).pipe(Effect.provide(PgClientTest)),
  )

  it.effect('refuses a Run in a chat no row holds through its key', () =>
    Effect.gen(function* () {
      yield* insertMessages
      const error = yield* insertRun(
        run('0192d4e0-7b3a-7c00-8000-00000000009d', {
          chatId: '0192d4e0-7b3a-7c00-8000-00000000009f',
        }),
      ).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'runs_chat_id_chats_id_fkey')
    }).pipe(Effect.provide(PgClientTest)),
  )

  it.effect('refuses a done Run naming a reply no row holds through its key', () =>
    Effect.gen(function* () {
      yield* insertMessages
      const error = yield* insertRun(
        run('0192d4e0-7b3a-7c00-8000-00000000009e', {
          status: 'done',
          assistantMessageId: '0192d4e0-7b3a-7c00-8000-0000000000a0',
        }),
      ).pipe(Effect.flip)

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), 'runs_assistant_message_id_messages_id_fkey')
    }).pipe(Effect.provide(PgClientTest)),
  )
})
