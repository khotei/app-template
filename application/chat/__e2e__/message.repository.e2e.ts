import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'
import { Model } from 'effect/schema'
import { SqlClient } from 'effect/sql'

import { UserId } from '@app-template/application/identity'
import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { Chat } from '#chat/domain/chat.model'
import { ChatId } from '#chat/domain/chat.util'
import { Message } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'
import { Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { ChatRepository } from '#chat/services/chat.repository'
import { MessageRepository } from '#chat/services/message.repository'
import { RunRepository } from '#chat/services/run.repository'

const RepositoriesTest = Layer.mergeAll(
  ChatRepository.layer,
  MessageRepository.layer,
  RunRepository.layer,
).pipe(Layer.provideMerge(PgClientTest))

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const at = (seconds: number) => Model.Override(DateTime.add(createdAt, { seconds }))

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')

const userMessage = (id: string, { chatId, seconds = 0 }: { chatId: string; seconds?: number }) =>
  Message.insert.make({
    id: MessageId.make(id),
    chatId: ChatId.make(chatId),
    author: 'user',
    text: 'Hi',
    createdAt: at(seconds),
  })

const run = (
  id: string,
  answered: typeof Message.insert.Type,
  {
    status = 'queued',
    seconds = 0,
  }: Partial<{ status: 'queued' | 'failed'; seconds: number }> = {},
) =>
  Run.insert.make({
    id: RunId.make(id),
    chatId: answered.chatId,
    userMessageId: answered.id,
    status,
    failure: status === 'failed' ? Option.some({ cause: '529 overloaded' }) : Option.none(),
    createdAt: at(seconds),
    updatedAt: at(seconds),
  })

const Messages = Schema.Array(Message)

const SelectedMessage = Schema.Option(Message)

const insertOwnedChats = (chatIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const chats = yield* ChatRepository

    yield* sql`insert into users ${sql.insert({ id: userId, createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)) })}`
    yield* Effect.forEach(
      chatIds,
      (id) =>
        chats.insert(
          Chat.insert.make({
            id: ChatId.make(id),
            userId,
            createdAt: Model.Override(DateTime.makeUnsafe(0)),
            updatedAt: Model.Override(DateTime.makeUnsafe(0)),
          }),
        ),
      { discard: true },
    )
  })

describe('MessageRepository', () => {
  it.effect("selects the chat's messages in creation order, not id order", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000040'
      const other = '0192d4e0-7b3a-7c00-8000-000000000041'
      const question = userMessage('0192d4e0-7b3a-7c00-8000-000000000052', { chatId })
      const followUp = userMessage('0192d4e0-7b3a-7c00-8000-000000000051', { chatId, seconds: 1 })
      yield* insertOwnedChats([chatId, other])
      yield* Effect.forEach(
        [
          question,
          userMessage('0192d4e0-7b3a-7c00-8000-000000000050', { chatId: other }),
          followUp,
        ],
        (each) => messages.insert(each),
      )

      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId: question.chatId }), [
        new Message(question),
        new Message(followUp),
      ])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("selectOne reads another chat's message or a stranger's chat's as none", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-00000000004c'
      const other = '0192d4e0-7b3a-7c00-8000-00000000004d'
      const strangerId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
      const question = userMessage('0192d4e0-7b3a-7c00-8000-00000000005e', { chatId })
      yield* insertOwnedChats([chatId, other])
      yield* messages.insert(question)

      const owned = yield* messages.selectOne({ id: question.id, chatId: question.chatId, userId })
      const elsewhere = yield* messages.selectOne({ id: question.id, chatId: ChatId.make(other) })
      const foreign = yield* messages.selectOne({ id: question.id, userId: strangerId })

      assertSchemaEquals(SelectedMessage, owned, Option.some(new Message(question)))
      assert.deepStrictEqual([elsewhere, foreign], [Option.none(), Option.none()])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("selectOne by chatId reads the chat's first message, none for an empty chat", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-00000000004a'
      const empty = '0192d4e0-7b3a-7c00-8000-00000000004b'
      const first = userMessage('0192d4e0-7b3a-7c00-8000-00000000005f', { chatId })
      yield* insertOwnedChats([chatId, empty])
      yield* messages.insert(
        userMessage('0192d4e0-7b3a-7c00-8000-00000000005d', { chatId, seconds: 1 }),
      )
      yield* messages.insert(first)

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectOne({ chatId: first.chatId }),
        Option.some(new Message(first)),
      )
      assert.deepStrictEqual(
        yield* messages.selectOne({ chatId: ChatId.make(empty) }),
        Option.none(),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect(
    "reads a user's message with the newest Run that answers it, a reply with the Run that wrote it",
    () =>
      Effect.gen(function* () {
        const messages = yield* MessageRepository
        const runs = yield* RunRepository
        const chatId = '0192d4e0-7b3a-7c00-8000-000000000048'
        const question = userMessage('0192d4e0-7b3a-7c00-8000-000000000060', { chatId })
        const reply = {
          ...userMessage('0192d4e0-7b3a-7c00-8000-000000000061', { chatId, seconds: 2 }),
          author: 'assistant',
          text: 'Hello',
        } as const
        const failed = run('0192d4e0-7b3a-7c00-8000-000000000070', question, { status: 'failed' })
        const retry = run('0192d4e0-7b3a-7c00-8000-000000000071', question, { seconds: 1 })
        const done = Run.update.make({
          id: retry.id,
          status: 'done',
          failure: Option.none(),
          assistantMessageId: Option.some(reply.id),
          updatedAt: retry.updatedAt,
        })
        yield* insertOwnedChats([chatId])
        yield* messages.insert(question)
        yield* Effect.forEach([failed, retry], runs.insert)
        yield* messages.insert(reply)
        yield* runs.update(done, 'queued')

        const answered = Option.some(new Run({ ...retry, ...done }))
        assertSchemaEquals(Messages, yield* messages.selectMany({ chatId: question.chatId }), [
          new Message({ ...question, run: answered }),
          new Message({ ...reply, run: answered }),
        ])
      }).pipe(Effect.provide(RepositoriesTest)),
  )
})
