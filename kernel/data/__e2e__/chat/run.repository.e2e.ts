import { assert, describe, it } from '@effect/vitest'
import { Effect, Exit, Layer, Option, Schema, type Types } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'
import { RunEntity } from '#kernel/data/chat/run.entity'
import { RunRepository } from '#kernel/data/chat/run.repository'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const RepositoryTest = RunRepository.layer.pipe(Layer.provideMerge(DbTest))

const createdAt = new Date('2026-11-09T00:00:00.123Z')
const updatedAt = createdAt

const userId = '0192d4e0-7b3a-7c00-8000-0000000000a0'
const chatId = '0192d4e0-7b3a-7c00-8000-0000000000a1'
const userMessageId = '0192d4e0-7b3a-7c00-8000-0000000000a2'

const run = (
  id: string,
  fields: Types.Simplify<Partial<Pick<RunEntity, 'status' | 'failure'>>> = {},
): RunEntity => ({
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

const SelectedRun = Schema.Option(RunEntity)

const active = ['queued', 'preparing', 'generating'] as const

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
          status: 'done',
          text: 'Hi',
          createdAt,
          updatedAt,
        }),
      ),
    ),
)

describe('RunRepository', () => {
  it.effect.fails(
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
          [Option.some(queued), Option.some(queued)],
        )
        assert.deepStrictEqual(foreign, Option.none())
      }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect.fails('insert dies on a second active Run in a chat and keeps the first', () =>
    Effect.gen(function* () {
      const runs = yield* RunRepository
      const queued = run('0192d4e0-7b3a-7c00-8000-0000000000a5')
      yield* insertUserMessage
      yield* runs.insert(queued)

      const exit = yield* runs.insert(run('0192d4e0-7b3a-7c00-8000-0000000000a6')).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(SelectedRun, yield* runs.selectOne({ chatId }), Option.some(queued))
    }).pipe(Effect.provide(RepositoryTest)),
  )

  it.effect.fails(
    'update moves a Run under its old status, and dies once that no longer holds',
    () =>
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
          Option.some(run(queued.id, { status: 'failed', failure })),
        )
      }).pipe(Effect.provide(RepositoryTest)),
  )
})
