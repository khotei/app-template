import { describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import {
  Chat,
  GenerateAssistantMessage,
  Message,
  Run,
  RunNotRetryableError,
} from '@app-template/application/chat'
import {
  type ChatRepositoryMocks,
  chat,
  firstMessage,
  layerChatTest,
  owner,
  queuedRun,
} from '@app-template/application/chat/testing'
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
          queue: 'assistant-message',
          message: new GenerateAssistantMessage({ runId: retried.id }),
        },
      ])
    }).pipe(
      Effect.provide(layerChatTest(chatWithRun(failedRun)).pipe(Layer.provideMerge(jobs.layer))),
    )
  })

  it.effect('a retry refused for a done Run queues no job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const error = yield* retry.pipe(Effect.flip)

      assertSchemaEquals(RunNotRetryableError, error, new RunNotRetryableError())
      assertEquals(yield* jobs.sent, [])
    }).pipe(
      Effect.provide(
        layerChatTest(chatWithRun(new Run({ ...queuedRun, status: 'done' }))).pipe(
          Layer.provideMerge(jobs.layer),
        ),
      ),
    )
  })
})
