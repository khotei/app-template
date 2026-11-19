import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import {
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
  type ChatRepositoryMocks,
  chat,
  firstMessage,
  layerChatTest,
  owner,
  queuedRun,
} from '@app-template/application/chat/testing'
import type { MessageEntityWhere, RunColumns } from '@app-template/kernel/data'
import { recordMessages } from '@app-template/packages/queue/testing'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { retryRun } from '#use-cases/chat/retry-run.use-case'

/** The reads of a chat whose newest Run is `newest`, with the message that Run answers. */
const chatWithRun = (newest: Run): ChatRepositoryMocks => ({
  messages: { selectOne: () => encodeWith(Message)(firstMessage).pipe(Effect.map(Option.some)) },
  chats: {
    selectOne: () =>
      encodeWith(Chat)(new Chat({ ...chat, run: Option.some(newest) })).pipe(
        Effect.map(Option.some),
      ),
  },
})

const failedRun = new Run({
  ...queuedRun,
  status: 'failed',
  failure: Option.some({ reason: 'LlmFailedError', cause: '529 overloaded' }),
})

const reply = assistantMessageAt(1, 'Sure.')

const doneRun = new Run({
  ...queuedRun,
  status: 'done',
  assistantMessageId: Option.some(reply.id),
  assistantMessage: Option.some(reply),
})

const retry = retryRun(owner, chat.id)

describe('retryRun', () => {
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
          new Run({
            id: retried.id,
            chatId: chat.id,
            userMessage: firstMessage,
            userMessageId: firstMessage.id,
            createdAt: retried.createdAt,
            updatedAt: retried.createdAt,
          }),
        )
        assert.deepStrictEqual(inserts, [yield* encodeWith(RunFields)(retried)])
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
          }).pipe(Layer.provideMerge(jobs.layer)),
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
    }).pipe(
      Effect.provide(layerChatTest(chatWithRun(queuedRun)).pipe(Layer.provideMerge(jobs.layer))),
    )
  })

  it.effect(
    "retry when the chat's newest Run is done is RunNotRetryableError before any job",
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const error = yield* retry.pipe(Effect.flip)

        assertSchemaEquals(RunNotRetryableError, error, new RunNotRetryableError())
        assertEquals(yield* jobs.sent, [])
      }).pipe(
        Effect.provide(layerChatTest(chatWithRun(doneRun)).pipe(Layer.provideMerge(jobs.layer))),
      )
    },
  )

  it.effect(
    "retry asks the store for the failed Run's message and answers its none as MessageNotFoundError",
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
            chats: chatWithRun(failedRun).chats,
            messages: {
              selectOne: (where) =>
                Effect.sync(() => {
                  wheres.push(where)
                }).pipe(Effect.as(Option.none())),
            },
          }).pipe(Layer.provideMerge(jobs.layer)),
        ),
      )
    },
  )
})
