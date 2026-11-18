import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import {
  buildRun,
  Chat,
  ChatBusyError,
  GenerateAssistantMessage,
  Message,
  MessageNotFoundError,
  Run,
  RunFields,
  RunNotRetryableError,
} from '@app-template/application/chat'
import {
  assistantMessageAt,
  chat,
  firstMessage,
  owner,
  queuedRun,
} from '@app-template/application/chat/testing'
import type { MessageEntityWhere, RunColumns } from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { recordMessages } from '@app-template/packages/queue/testing'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { type ChatRepositoryMocks, layerChatTest } from '#testing/use-cases/chat.test-layer'
import { RetryRunUseCase } from '#use-cases/chat/retry-run.use-case'

/** The reads of a chat whose newest Run is `newest`, with the message the retry names. */
const chatWithRun = (newest: Run): ChatRepositoryMocks => ({
  messages: { selectOne: () => encodeRowWith(Message)(firstMessage).pipe(Effect.map(Option.some)) },
  chats: {
    selectOne: () =>
      encodeRowWith(Chat)(new Chat({ ...chat, run: Option.some(newest) })).pipe(
        Effect.map(Option.some),
      ),
  },
})

const failedRun = new Run({
  ...queuedRun,
  status: 'failed',
  failure: Option.some({ reason: 'ReplyFailed', message: 'Try again.' }),
})

const reply = assistantMessageAt(1, 'Sure.')

const doneRun = new Run({
  ...queuedRun,
  status: 'done',
  assistantMessageId: Option.some(reply.id),
  assistantMessage: Option.some(reply),
})

const retry = RetryRunUseCase.use((useCase) => useCase.retry(owner, chat.id, firstMessage.id))

describe('RetryRunUseCase', () => {
  it.effect(
    'retry after a failed Run inserts a new queued Run of the message and queues its job',
    () => {
      const jobs = recordMessages()
      const inserts: Array<RunColumns> = []
      return Effect.gen(function* () {
        const retried = yield* retry

        assertSchemaEquals(
          Run,
          retried,
          buildRun({
            id: retried.id,
            chatId: chat.id,
            userMessage: firstMessage,
            createdAt: retried.createdAt,
          }),
        )
        assert.deepStrictEqual(inserts, [yield* encodeRowWith(RunFields)(retried)])
        assertEquals(yield* jobs.sent, [
          {
            queue: 'assistant-message',
            message: new GenerateAssistantMessage({ runId: retried.id }),
          },
        ])
      }).pipe(
        Effect.provide(
          layerChatTest({
            ...chatWithRun(failedRun),
            runs: {
              insert: (row) =>
                Effect.sync(() => {
                  inserts.push(row)
                }),
            },
          }).pipe(Layer.provide(jobs.layer)),
        ),
      )
    },
  )

  it.effect('retry while a Run is in work is ChatBusyError before any Run or job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const error = yield* retry.pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest(chatWithRun(queuedRun)).pipe(Layer.provide(jobs.layer))))
  })

  it.effect('retry of an answered message is RunNotRetryableError before any Run or job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const error = yield* retry.pipe(Effect.flip)

      assertSchemaEquals(
        RunNotRetryableError,
        error,
        new RunNotRetryableError({ userMessageId: firstMessage.id }),
      )
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest(chatWithRun(doneRun)).pipe(Layer.provide(jobs.layer))))
  })

  it.effect(
    "retry asks the store for the user's message and answers its none as MessageNotFoundError",
    () => {
      const jobs = recordMessages()
      const wheres: Array<MessageEntityWhere> = []
      return Effect.gen(function* () {
        const error = yield* retry.pipe(Effect.flip)

        assertSchemaEquals(
          MessageNotFoundError,
          error,
          new MessageNotFoundError({ id: firstMessage.id, author: Option.some('user') }),
        )
        assert.deepStrictEqual(wheres, [
          { id: firstMessage.id, chatId: chat.id, userId: owner, author: 'user' },
        ])
        assertEquals(yield* jobs.sent, [])
      }).pipe(
        Effect.provide(
          layerChatTest({
            messages: {
              selectOne: (where) =>
                Effect.sync(() => {
                  wheres.push(where)
                }).pipe(Effect.as(Option.none())),
            },
          }).pipe(Layer.provide(jobs.layer)),
        ),
      )
    },
  )
})
