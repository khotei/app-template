import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Option, Schema } from 'effect'

import type { MessageColumns, MessageEntityWhere, RunColumns } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { ChatBusyError } from '#chat/domain/chat.error'
import { Chat } from '#chat/domain/chat.model'
import { MessageNotFoundError } from '#chat/domain/message.error'
import { Message, MessageFields } from '#chat/domain/message.model'
import { RunNotRetryableError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunFields } from '#chat/domain/run-fields.model'
import { AskChatService } from '#chat/services/ask-chat.service'
import {
  assistantMessageAt,
  chat,
  firstMessage,
  owner,
  queuedRun,
} from '#testing/chat/chat.test-fixture'
import { type ChatRepositoryMocks, layerChatTest } from '#testing/chat/chat.test-layer'

/** Every refusal a retry answers before its first write. */
const RetryRefusal = Schema.Union([ChatBusyError, RunNotRetryableError, MessageNotFoundError])

/** The rows each repository's `insert` is handed. */
interface Inserts {
  readonly messages: Array<MessageColumns>
  readonly runs: Array<RunColumns>
}

const noInserts = (): Inserts => ({ messages: [], runs: [] })

/** Inserts that keep each row they are handed in `inserts`, and `mocks`'s reads. */
const insertingInto = (inserts: Inserts, mocks: ChatRepositoryMocks = {}): ChatRepositoryMocks => ({
  ...mocks,
  messages: {
    ...mocks.messages,
    insert: (row) =>
      Effect.sync(() => {
        inserts.messages.push(row)
      }),
  },
  runs: {
    insert: (row) =>
      Effect.sync(() => {
        inserts.runs.push(row)
      }),
  },
})

/** The read of the message the failed Run answers. */
const readsFirstMessage = {
  messages: { selectOne: () => encodeWith(Message)(firstMessage).pipe(Effect.map(Option.some)) },
} satisfies ChatRepositoryMocks

const withNewest = (newest: Run) => new Chat({ ...chat, run: Option.some(newest) })

const failedRun = new Run({
  ...queuedRun,
  status: 'failed',
  failure: Option.some({ cause: '529 overloaded' }),
})

const reply = assistantMessageAt(1, 'Sure.')

const doneRun = new Run({
  ...queuedRun,
  status: 'done',
  assistantMessageId: Option.some(reply.id),
  assistantMessage: Option.some(reply),
})

const ask = (read: Chat, text: string) => AskChatService.use((asks) => asks.ask(read, text))

const retry = (read: Chat) => AskChatService.use((asks) => asks.retry(read))

describe('AskChatService', () => {
  it.live('ask inserts the user message and its queued Run, writing no chat', () => {
    const inserts = noInserts()
    return Effect.gen(function* () {
      const run = yield* ask(chat, 'Plan a weekend in Lisbon')

      const { userMessage } = run
      const sentAt = userMessage.createdAt
      assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
      assert.isTrue(DateTime.isGreaterThanOrEqualTo(run.createdAt, sentAt))
      assert.isTrue(isUuidV7(userMessage.id) && isUuidV7(run.id))
      assertEquals(
        run,
        new Run({
          id: run.id,
          chatId: chat.id,
          userMessage: new Message({
            author: 'user',
            id: userMessage.id,
            chatId: chat.id,
            text: 'Plan a weekend in Lisbon',
            createdAt: sentAt,
          }),
          userMessageId: userMessage.id,
          createdAt: run.createdAt,
          updatedAt: run.createdAt,
        }),
      )
      assert.deepStrictEqual(inserts.messages, [yield* encodeWith(MessageFields)(userMessage)])
      assert.deepStrictEqual(inserts.runs, [yield* encodeWith(RunFields)(run)])
    }).pipe(Effect.provide(layerChatTest(insertingInto(inserts))))
  })

  it.effect('ask while a Run is in work is ChatBusyError before any write', () =>
    Effect.gen(function* () {
      const refused = yield* ask(withNewest(queuedRun), 'And in Porto?').pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, refused, new ChatBusyError({ id: chat.id }))
    }).pipe(Effect.provide(layerChatTest({}))),
  )

  it.effect.each([
    {
      name: 'while a Run is in work',
      read: withNewest(queuedRun),
      error: new ChatBusyError({ id: chat.id }),
    },
    {
      name: "when the chat's newest Run is done",
      read: withNewest(doneRun),
      error: new RunNotRetryableError(),
    },
  ])('retry $name is refused before any write', ({ read, error }) =>
    Effect.gen(function* () {
      const refused = yield* retry(read).pipe(Effect.flip)

      assertSchemaEquals(RetryRefusal, refused, error)
    }).pipe(Effect.provide(layerChatTest({}))),
  )

  it.effect('retry after a failed Run inserts a new queued Run of its message', () => {
    const inserts = noInserts()
    return Effect.gen(function* () {
      const retried = yield* retry(withNewest(failedRun))

      assertSchemaEquals(
        Run,
        retried,
        new Run({
          id: retried.id,
          chatId: chat.id,
          userMessage: firstMessage,
          userMessageId: firstMessage.id,
          createdAt: retried.createdAt,
          updatedAt: retried.createdAt,
        }),
      )
      assert.deepStrictEqual(inserts.runs, [yield* encodeWith(RunFields)(retried)])
      assert.deepStrictEqual(inserts.messages, [])
    }).pipe(Effect.provide(layerChatTest(insertingInto(inserts, readsFirstMessage))))
  })

  it.effect(
    "retry asks the store for the failed Run's message in the user's chat and answers its none as MessageNotFoundError",
    () => {
      const wheres: Array<MessageEntityWhere> = []
      return Effect.gen(function* () {
        const error = yield* retry(withNewest(failedRun)).pipe(Effect.flip)

        assertSchemaEquals(
          MessageNotFoundError,
          error,
          new MessageNotFoundError({ id: firstMessage.id, author: Option.some('user') }),
        )
        assert.deepStrictEqual(wheres, [
          { id: firstMessage.id, chatId: chat.id, userId: owner, author: 'user' },
        ])
      }).pipe(
        Effect.provide(
          layerChatTest({
            messages: {
              selectOne: (where) =>
                Effect.sync(() => {
                  wheres.push(where)
                }).pipe(Effect.as(Option.none())),
            },
          }),
        ),
      )
    },
  )
})
