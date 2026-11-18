import { describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Layer, Option } from 'effect'

import {
  buildRun,
  ChatBusyError,
  failRun,
  GenerateAssistantMessage,
  MessageNotFoundError,
  Run,
  type RunId,
} from '@app-template/application/chat'
import {
  assistantMessageAt,
  chat,
  insertMessage,
  owner,
  updateRun,
} from '@app-template/application/chat/testing'
import { recordMessages, type SentMessage } from '@app-template/packages/queue/testing'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatTest } from '#testing/use-cases/chat.test-layer'
import { CreateUserMessageUseCase } from '#use-cases/chat/create-user-message.use-case'
import { RetryRunUseCase } from '#use-cases/chat/retry-run.use-case'

const replyJob = (runId: RunId) => ({
  queue: 'assistant-message',
  message: new GenerateAssistantMessage({ runId }),
})

function replyJobsOf(sent: ReadonlyArray<SentMessage>) {
  return Arr.filter(sent, ({ queue }) => queue === 'assistant-message')
}

describe('RetryRunUseCase', () => {
  it.effect(
    'retry after a failed Run stores a new queued Run of the message and queues its job',
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const createUserMessage = yield* CreateUserMessageUseCase
        const retryRun = yield* RetryRunUseCase
        const first = yield* createUserMessage.create(owner, chat.id, {
          text: 'Plan a weekend in Lisbon',
          attachmentIds: [],
        })
        const at = yield* DateTime.now
        yield* failRun(first, { reason: 'ReplyFailed', cause: 'overloaded', at }).pipe(
          Effect.flatMap(updateRun),
        )

        const retried = yield* retryRun.retry(owner, chat.id, first.userMessageId)

        assertSchemaEquals(
          Run,
          retried,
          buildRun({
            id: retried.id,
            chatId: chat.id,
            userMessage: first.userMessage,
            createdAt: retried.createdAt,
          }),
        )
        assertEquals((yield* jobs.sent).at(-1), replyJob(retried.id))
      }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
    },
  )

  it.effect('retry while a Run is in work is ChatBusyError before any Run or job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const createUserMessage = yield* CreateUserMessageUseCase
      const retryRun = yield* RetryRunUseCase
      const first = yield* createUserMessage.create(owner, chat.id, {
        text: 'Plan a weekend in Lisbon',
        attachmentIds: [],
      })

      const error = yield* retryRun.retry(owner, chat.id, first.userMessageId).pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
      assertEquals(replyJobsOf(yield* jobs.sent), [replyJob(first.id)])
    }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
  })

  it.effect("retry of an assistant's message is MessageNotFoundError of a user's message", () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const createUserMessage = yield* CreateUserMessageUseCase
      const retryRun = yield* RetryRunUseCase
      const first = yield* createUserMessage.create(owner, chat.id, {
        text: 'Plan a weekend in Lisbon',
        attachmentIds: [],
      })
      const at = yield* DateTime.now
      yield* failRun(first, { reason: 'ReplyFailed', cause: 'overloaded', at }).pipe(
        Effect.flatMap(updateRun),
      )
      const reply = assistantMessageAt(1, 'An earlier reply')
      yield* insertMessage(reply)

      const error = yield* retryRun.retry(owner, chat.id, reply.id).pipe(Effect.flip)

      assertSchemaEquals(
        MessageNotFoundError,
        error,
        new MessageNotFoundError({ id: reply.id, author: Option.some('user') }),
      )
      assertEquals(replyJobsOf(yield* jobs.sent), [replyJob(first.id)])
    }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
  })
})
