import { assert, describe, it } from '@effect/vitest'
import { Effect, Schema, Struct, type Types } from 'effect'

import { flipSqlError } from '@app-template/packages/db/testing/e2e'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { chats } from '#kernel/data/chat/chat.table'
import { messages, runs } from '#kernel/data/chat/message.table'
import { RunEntity } from '#kernel/data/chat/run.entity'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const createdAt = new Date('2026-11-09T00:00:00.123Z')
const updatedAt = new Date('2026-11-09T00:00:01.456Z')

const userId = '0192d4e0-7b3a-7c00-8000-000000000090'
const chatId = '0192d4e0-7b3a-7c00-8000-000000000091'
const userMessageId = '0192d4e0-7b3a-7c00-8000-000000000092'

const RunRow = Schema.Struct(Struct.omit(RunEntity.fields, ['userMessage', 'assistantMessage']))
type RunRow = typeof RunRow.Type

const run = (id: string, fields: Types.Simplify<Partial<Pick<RunRow, 'status'>>>): RunRow => ({
  id,
  chatId,
  userMessageId,
  status: 'queued',
  failure: null,
  provenance: { provider: 'anthropic', model: 'claude-haiku-5-5', instructionsHash: 'abc' },
  createdAt,
  updatedAt,
  ...fields,
})

const insertUserMessage = Db.use((db) =>
  db
    .insert(users)
    .values({ id: userId, createdAt: new Date(0) })
    .pipe(
      Effect.andThen(
        db.insert(chats).values({ id: chatId, userId, title: null, createdAt, updatedAt }),
      ),
      Effect.andThen(
        db.insert(messages).values({
          id: userMessageId,
          chatId,
          author: 'user',
          text: 'Hi',
          createdAt,
        }),
      ),
    ),
)

const insertRun = (row: RunRow) => Db.use((db) => db.insert(runs).values(row))

const selectRuns = Db.use((db) => db.select().from(runs).orderBy(runs.id)).pipe(
  Effect.flatMap(Schema.decodeEffect(Schema.Array(RunRow))),
)

describe('runs', () => {
  it.effect('reads back a queued Run beside a done one of the same message', () =>
    Effect.gen(function* () {
      const done = run('0192d4e0-7b3a-7c00-8000-000000000093', { status: 'done' })
      const queued = run('0192d4e0-7b3a-7c00-8000-000000000094', {})

      yield* insertUserMessage
      yield* insertRun(done)
      yield* insertRun(queued)
      const selected = yield* selectRuns

      assertSchemaEquals(Schema.Array(RunRow), selected, [done, queued])
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('refuses a second active Run in a chat through the partial unique index', () =>
    Effect.gen(function* () {
      yield* insertUserMessage
      yield* insertRun(run('0192d4e0-7b3a-7c00-8000-000000000095', {}))
      const error = yield* flipSqlError(
        insertRun(run('0192d4e0-7b3a-7c00-8000-000000000096', { status: 'generating' })),
      )

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'runs_chat_id_active_index')
    }).pipe(Effect.provide(DbTest)),
  )
})
