import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer } from 'effect'

import {
  buildRun,
  ChatBusyError,
  failRun,
  GenerateAssistantMessage,
  Run,
  type RunId,
} from '@app-template/application/chat'
import { chat, owner, replyProvenance, updateRun } from '@app-template/application/chat/testing'
import { recordMessages } from '@app-template/packages/queue/testing'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatTest } from '#testing/use-cases/chat.test-layer'
import { CreateUserMessageUseCase } from '#use-cases/chat/create-user-message.use-case'
import { RetryRunUseCase } from '#use-cases/chat/retry-run.use-case'

const replyJob = (runId: RunId) => ({
  queue: 'assistant-message',
  message: new GenerateAssistantMessage({ chatId: chat.id, runId }),
})

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
            provenance: replyProvenance,
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
      // The send's reply and title jobs, and none of the retry.
      assert.lengthOf(yield* jobs.sent, 2)
    }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
  })
})
