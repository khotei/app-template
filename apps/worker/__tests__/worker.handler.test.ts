import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, ConfigProvider, Effect, Layer, Option } from 'effect'

import { ChatAssistant, ReplyChatService, TitleChatService } from '@app-template/application/chat'
import { chatId, firstMessage, owner } from '@app-template/application/chat/testing'
import {
  ChatRepository,
  type MessageEntityWhere,
  MessageRepository,
  type RunEntitySelectWhere,
  RunRepository,
} from '@app-template/kernel/data'
import { TransactionTest } from '@app-template/packages/db/testing'
import { recordLogs } from '@app-template/packages/testing'

import { consumeEvent } from '#worker/worker.handler'

const buildRecord = (queue: string, body: unknown) => ({
  messageId: 'a',
  body: JSON.stringify(body),
  eventSourceARN: `arn:aws:sqs:us-east-1:000000000000:${queue}`,
  messageAttributes: {},
})

describe('consumeEvent', () => {
  it.effect.each([
    {
      queue: 'chat-initialized',
      store: 'messages',
      where: { id: firstMessage.id, chatId, userId: owner },
    },
    {
      queue: 'user-message-created',
      store: 'runs',
      where: { userMessageId: firstMessage.id, chatId, userId: owner },
    },
    {
      queue: 'message-retried',
      store: 'runs',
      where: { userMessageId: firstMessage.id, chatId, userId: owner },
    },
  ])(
    'runs a batch of $queue on its handler, which reads $store first by the event',
    ({ queue, store, where }) => {
      const reads: Array<readonly [string, MessageEntityWhere | RunEntitySelectWhere]> = []
      const { logs, layer: logger } = recordLogs()
      // Only the first read of each handler returns, empty: any other store call dies, which the
      // consumer logs.
      const handlers = Layer.mergeAll(ReplyChatService.layer, TitleChatService.layer).pipe(
        Layer.provide([
          Layer.mock(MessageRepository, {
            selectOne: (read) =>
              Effect.sync(() => {
                reads.push(['messages', read])
              }).pipe(Effect.as(Option.none())),
          }),
          Layer.mock(RunRepository, {
            selectOne: (read) =>
              Effect.sync(() => {
                reads.push(['runs', read])
              }).pipe(Effect.as(Option.none())),
          }),
          Layer.mock(ChatRepository, {}),
          Layer.mock(ChatAssistant, {}),
          TransactionTest,
        ]),
        // Merged, not provided: `consumeEvent` reads the stage itself, with each event.
        Layer.provideMerge(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              AWS_REGION: 'us-east-1',
              STAGE: 'test',
              LLM_CHAT_CONTEXT_TOKENS_LIMIT: 1_000_000,
            }),
          ),
        ),
        Layer.provide(logger),
      )
      return Effect.gen(function* () {
        const record = buildRecord(`app-template-test-${queue}`, {
          chatId,
          userId: owner,
          messageId: firstMessage.id,
        })

        const response = yield* consumeEvent({ Records: [record] })

        assert.deepStrictEqual(response, { batchItemFailures: [] })
        assert.deepStrictEqual(
          Arr.map(reads, ([read]) => read),
          [store],
        )
        assert.deepInclude(reads[0]?.[1], where)
        assert.isFalse(Arr.some(logs, ([, message]) => message === 'queue message failed'))
      }).pipe(Effect.provide(handlers))
    },
  )
})
