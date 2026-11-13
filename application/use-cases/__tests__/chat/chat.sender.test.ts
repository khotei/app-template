import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Option } from 'effect'

import { RunNotQueuedError } from '@app-template/application/chat'
import {
  firstMessage,
  insertMessage,
  insertRun,
  queuedRun,
  selectRun,
} from '@app-template/application/chat/testing'
import { QueueError, QueueSender } from '@app-template/packages/queue'
import { assertSchemaEquals, recordLogs } from '@app-template/packages/testing'

import { ChatSenderTest } from '#testing/use-cases/chat.test-layer'
import { AssistantMessageSender, ChatTitleSender } from '#use-cases/chat/chat.sender'

/** A `QueueSender` that SQS refuses. */
const RefusingQueueTest = Layer.succeed(
  QueueSender,
  QueueSender.of({
    send: () => Effect.fail(new QueueError({ cause: new Error('SQS is unavailable') })),
  }),
)

const SenderTest = Layer.provide(ChatSenderTest, RefusingQueueTest)

describe('AssistantMessageSender', () => {
  it.effect('a send SQS refuses fails the Run with ReplyFailed and is RunNotQueuedError', () => {
    const { logs, layer: logger } = recordLogs('chatId', 'runId')
    return Effect.gen(function* () {
      const sender = yield* AssistantMessageSender
      yield* insertMessage(firstMessage)
      yield* insertRun(queuedRun)

      const error = yield* sender.send(queuedRun).pipe(Effect.flip)

      const run = yield* selectRun(queuedRun.id).pipe(Effect.map(Option.getOrThrow))
      assertSchemaEquals(RunNotQueuedError, error, new RunNotQueuedError({ id: queuedRun.id }))
      assert.strictEqual(run.status, 'failed')
      assert.strictEqual(Option.getOrThrow(run.failure).reason, 'ReplyFailed')
      assert.include(Option.getOrThrow(run.failure).cause, 'SQS is unavailable')
      assert.deepStrictEqual(logs, [
        ['Error', 'assistant message not queued', queuedRun.chatId, queuedRun.id],
      ])
    }).pipe(Effect.provide([SenderTest, logger]))
  })
})

describe('ChatTitleSender', () => {
  it.effect('a send SQS refuses is logged with its chat and message', () => {
    const { logs, layer: logger } = recordLogs('chatId', 'messageId')
    return Effect.gen(function* () {
      const sender = yield* ChatTitleSender

      yield* sender.send(firstMessage)

      assert.deepStrictEqual(logs, [
        ['Error', 'chat title not queued', firstMessage.chatId, firstMessage.id],
      ])
    }).pipe(Effect.provide([SenderTest, logger]))
  })
})
