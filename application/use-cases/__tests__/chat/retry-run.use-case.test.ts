import { describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Option } from 'effect'

import { Chat, ReplyToMessage, Run, RunNotRetryableError } from '@app-template/application/chat'
import {
  type ChatRepositoryMocks,
  chat,
  firstMessage,
  layerChatTest,
  owner,
  queuedRun,
} from '@app-template/application/chat/testing'
import { recordMessages } from '@app-template/packages/queue/testing'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { retryRun } from '#use-cases/chat/retry-run.use-case'

/** The reads of a chat whose newest Run is `newest`, with the message that Run answers. */
const chatWithRun = (newest: Run): ChatRepositoryMocks => ({
  messages: { selectOne: () => Effect.succeedSome(firstMessage) },
  chats: { selectOne: () => Effect.succeedSome(new Chat({ ...chat, run: Option.some(newest) })) },
  runs: { insert: () => Effect.void },
})

const failedRun = new Run({
  ...queuedRun,
  status: 'failed',
  failure: Option.some({ cause: '529 overloaded' }),
})

const retry = retryRun(owner, chat.id)

describe('retryRun', () => {
  it.effect('retry after a failed Run queues the job of the new Run', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const retried = yield* retry

      assertEquals(yield* jobs.sent, [
        {
          queue: 'reply-to-message',
          message: new ReplyToMessage({ messageId: retried.userMessageId }),
        },
      ])
    }).pipe(Effect.provide(layerChatTest(chatWithRun(failedRun), { queue: jobs.layer })))
  })

  it.effect('a retry refused for a done Run queues no job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const error = yield* retry.pipe(Effect.flip)

      assertSchemaEquals(RunNotRetryableError, error, new RunNotRetryableError())
      assertEquals(yield* jobs.sent, [])
    }).pipe(
      Effect.provide(
        layerChatTest(chatWithRun(new Run({ ...queuedRun, status: 'done' })), {
          queue: jobs.layer,
        }),
      ),
    )
  })
})
