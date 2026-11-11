import { assert, describe, it } from '@effect/vitest'
import { Effect, Exit, Layer, Option, Schema, Struct, type Types } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { type ChatColumns, chats } from '#kernel/data/chat/chat.table'
import type { MessageEntity } from '#kernel/data/chat/message.entity'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import { messages } from '#kernel/data/chat/message.table'
import { RunEntity } from '#kernel/data/chat/run.entity'
import { RunRepository } from '#kernel/data/chat/run.repository'
import type { RunColumns } from '#kernel/data/chat/run.table'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const RepositoryTest = Layer.mergeAll(RunRepository.layer, MessageRepository.layer).pipe(
  Layer.provideMerge(DbTest),
)

const createdAt = new Date('2026-11-09T00:00:00.123Z')
const updatedAt = createdAt

const userId = '0192d4e0-7b3a-7c00-8000-0000000000a0'
const chatId = '0192d4e0-7b3a-7c00-8000-0000000000a1'
const userMessageId = '0192d4e0-7b3a-7c00-8000-0000000000a2'

const chat = { id: chatId, userId, title: null, createdAt, updatedAt } satisfies ChatColumns

const userMessage = {
  id: userMessageId,
  chatId,
  author: 'user',
  text: 'Hi',
  createdAt,
  attachments: [],
} satisfies MessageEntity

type RunRow = RunColumns

const run = (
  id: string,
  fields: Types.Simplify<Partial<Pick<RunRow, 'status' | 'failure' | 'assistantMessageId'>>> = {},
): RunRow => ({
  id,
  chatId,
  userMessageId,
  status: 'queued',
  failure: null,
  assistantMessageId: null,
  provenance: { provider: 'anthropic', model: 'claude-haiku-5-5', instructionsHash: 'abc' },
  createdAt,
  updatedAt,
  ...fields,
})

/** `row` as a read nests its chat and its messages, the reply none unless given. */
const read = (row: RunRow, assistantMessage: MessageEntity | null = null): RunEntity => ({
  ...row,
  chat,
  userMessage,
  assistantMessage,
})

const SelectedRun = Schema.Option(RunEntity)

const active = ['queued', 'preparing', 'generating'] as const

const insertUserMessage = Db.use((db) =>
  db
    .insert(users)
    .values({ id: userId, createdAt: new Date(0) })
    .pipe(
      Effect.andThen(db.insert(chats).values(chat)),
      Effect.andThen(db.insert(messages).values(Struct.omit(userMessage, ['attachments']))),
    ),
)

describe('RunRepository', () => {
  it.effect(
    "selects a Run by id for its owner, as the chat's active one, none for a stranger",
    () =>
      Effect.gen(function* () {
        const runs = yield* RunRepository
        const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a3')
        const strangerId = '0192d4e0-7b3a-7c00-8000-0000000000af'
        yield* insertUserMessage
        yield* runs.insert(queued)

        const owned = yield* runs.selectOne({ id: queued.id, userId })
        const inFlight = yield* runs.selectOne({ chatId, status: active })
        const foreign = yield* runs.selectOne({ id: queued.id, userId: strangerId })

        assertSchemaEquals(
          Schema.Array(SelectedRun),
          [owned, inFlight],
          [Option.some(read(queued)), Option.some(read(queued))],
        )
        assert.deepStrictEqual(foreign, Option.none())
      }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect('insert dies on a second active Run in a chat and keeps the first', () =>
    Effect.gen(function* () {
      const runs = yield* RunRepository
      const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a5')
      yield* insertUserMessage
      yield* runs.insert(queued)

      const exit = yield* runs.insert(run('0192d4e0-7b3a-7c00-8000-0000000000a6')).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(SelectedRun, yield* runs.selectOne({ chatId }), Option.some(read(queued)))
    }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect('update moves a Run under its old status, and dies once that no longer holds', () =>
    Effect.gen(function* () {
      const runs = yield* RunRepository
      const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a7')
      const failure = { reason: 'ReplyFailed', message: 'Try again.', cause: 'timeout' } as const
      yield* insertUserMessage
      yield* runs.insert(queued)

      yield* runs.update({ status: 'failed', failure }, { id: queued.id, status: ['queued'] })
      const exit = yield* runs
        .update({ status: 'preparing' }, { id: queued.id, status: ['queued'] })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedRun,
        yield* runs.selectOne({ id: queued.id }),
        Option.some(read(run(queued.id, { status: 'failed', failure }))),
      )
    }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect(
    'selectOne nests the chat, the message the Run answers and, once written, its reply',
    () =>
      Effect.gen(function* () {
        const runs = yield* RunRepository
        const messages = yield* MessageRepository
        const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a8')
        const reply = {
          ...userMessage,
          id: '0192d4e0-7b3a-7c00-8000-0000000000a9',
          author: 'assistant',
          text: 'Hello',
        } satisfies MessageEntity
        yield* insertUserMessage
        yield* runs.insert(queued)

        yield* messages.insert(Struct.omit(reply, ['attachments']))
        const done = { status: 'done', assistantMessageId: reply.id } as const
        yield* runs.update(done, { id: queued.id, status: ['queued'] })

        assertSchemaEquals(
          SelectedRun,
          yield* runs.selectOne({ id: queued.id }),
          Option.some(read(run(queued.id, done), reply)),
        )
      }).pipe(Effect.provide(RepositoryTest)),
  )
})
