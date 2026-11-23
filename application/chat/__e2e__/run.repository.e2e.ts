import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Exit, Layer, Option, Schema } from 'effect'
import { Model } from 'effect/schema'
import { SqlClient } from 'effect/sql'

import { UserId } from '@app-template/application/identity'
import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatId } from '#chat/domain/chat.util'
import { Message } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'
import { Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { MessageRepository } from '#chat/services/message.repository'
import { RunRepository } from '#chat/services/run.repository'

const RepositoryTest = Layer.mergeAll(RunRepository.layer, MessageRepository.layer).pipe(
  Layer.provideMerge(PgClientTest),
)

const createdAt = Model.Override(DateTime.makeUnsafe('2026-11-09T00:00:00.123Z'))
const updatedAt = createdAt

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-0000000000a0')
const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-0000000000a1')
const userMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-0000000000a2')

const userMessage = Message.insert.make({
  id: userMessageId,
  chatId,
  author: 'user',
  text: 'Hi',
  createdAt,
})

const run = (
  id: string,
  fields: Partial<Pick<typeof Run.insert.Type, 'status' | 'failure' | 'assistantMessageId'>> = {},
) =>
  Run.insert.make({
    id: RunId.make(id),
    chatId,
    userMessageId,
    createdAt,
    updatedAt,
    ...fields,
  })

/** The write that moves `row` to `fields`, its `updatedAt` kept. */
const move = (
  row: typeof Run.insert.Type,
  fields: Partial<Pick<typeof Run.update.Type, 'status' | 'failure' | 'assistantMessageId'>>,
) => Run.update.make({ ...row, ...fields, updatedAt })

/** `row` as a read returns it. */
const read = (row: typeof Run.insert.Type) => new Run(row)

const SelectedRun = Schema.Option(Run)

const insertUserMessage = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const messages = yield* MessageRepository

  yield* sql`insert into users ${sql.insert({ id: userId, createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)) })}`
  yield* sql`insert into chats ${sql.insert({
    id: chatId,
    userId,
    title: null,
    createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)),
    updatedAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)),
  })}`
  yield* messages.insert(userMessage)
})

describe('RunRepository', () => {
  it.effect('selects a Run by id for its owner, none for a stranger', () =>
    Effect.gen(function* () {
      const runs = yield* RunRepository
      const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a3')
      const strangerId = UserId.make('0192d4e0-7b3a-7c00-8000-0000000000af')
      yield* insertUserMessage
      yield* runs.insert(queued)

      const owned = yield* runs.selectOne({ id: queued.id, userId })
      const foreign = yield* runs.selectOne({ id: queued.id, userId: strangerId })

      assertSchemaEquals(SelectedRun, owned, Option.some(read(queued)))
      assert.deepStrictEqual(foreign, Option.none())
    }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect('selects a Run in one of the statuses its filter names, none in another', () =>
    Effect.gen(function* () {
      const runs = yield* RunRepository
      const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a4')
      yield* insertUserMessage
      yield* runs.insert(queued)

      const active = yield* runs.selectOne({ id: queued.id, status: ['queued', 'generating'] })
      const settled = yield* runs.selectOne({ id: queued.id, status: ['done', 'failed'] })

      assertSchemaEquals(SelectedRun, active, Option.some(read(queued)))
      assert.deepStrictEqual(settled, Option.none())
    }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect('selects the Run of the user message its filter names, none of another', () =>
    Effect.gen(function* () {
      const runs = yield* RunRepository
      const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a5')
      const otherMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-0000000000ae')
      yield* insertUserMessage
      yield* runs.insert(queued)

      const own = yield* runs.selectOne({ userMessageId, status: ['queued', 'generating'] })
      const other = yield* runs.selectOne({
        userMessageId: otherMessageId,
        status: ['queued', 'generating'],
      })

      assertSchemaEquals(SelectedRun, own, Option.some(read(queued)))
      assert.deepStrictEqual(other, Option.none())
    }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect('update moves a Run from the status it was read in, and dies once it moved since', () =>
    Effect.gen(function* () {
      const runs = yield* RunRepository
      const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a7')
      const failure = Option.some({ cause: '529 overloaded' })
      yield* insertUserMessage
      yield* runs.insert(queued)

      yield* runs.update(move(queued, { status: 'failed', failure }), 'queued')
      const exit = yield* runs
        .update(move(queued, { status: 'generating' }), 'queued')
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedRun,
        yield* runs.selectOne({ id: queued.id }),
        Option.some(read(run(queued.id, { status: 'failed', failure }))),
      )
    }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect("selectOne reads the reply's id once it is written", () =>
    Effect.gen(function* () {
      const runs = yield* RunRepository
      const messages = yield* MessageRepository
      const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a8')
      const reply = {
        ...userMessage,
        id: MessageId.make('0192d4e0-7b3a-7c00-8000-0000000000a9'),
        author: 'assistant',
        text: 'Hello',
      } as const
      yield* insertUserMessage
      yield* runs.insert(queued)

      yield* messages.insert(reply)
      const done = { status: 'done', assistantMessageId: Option.some(reply.id) } as const
      yield* runs.update(move(queued, done), 'queued')

      assertSchemaEquals(
        SelectedRun,
        yield* runs.selectOne({ id: queued.id }),
        Option.some(read(run(queued.id, done))),
      )
    }).pipe(Effect.provide(RepositoryTest)),
  )
})
