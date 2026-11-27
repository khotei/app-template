import { BunHttpServer } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, ConfigProvider, Effect, Layer, Option } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'

import { ChatAssistant, MessageAssistant } from '@app-template/application/chat'
import { chatId, firstMessage, owner } from '@app-template/application/chat/testing'
import { ChatRepository, MessageRepository, RunRepository } from '@app-template/kernel/data'
import { TransactionTest } from '@app-template/packages/db/testing'
import { recordLogs } from '@app-template/packages/testing'

import { WorkerHttp } from '#worker/layer'

const buildRecord = (queue: string, body: unknown) => ({
  messageId: 'a',
  body: JSON.stringify(body),
  eventSourceARN: `arn:aws:sqs:us-east-1:000000000000:${queue}`,
  messageAttributes: {},
})

describe('POST /events', () => {
  it.effect.each([
    { queue: 'chat-initialized', store: 'messages' },
    { queue: 'user-message-created', store: 'runs' },
    { queue: 'message-retried', store: 'runs' },
  ])('runs a batch of $queue on its handler, which reads $store first', ({ queue, store }) => {
    const reads: Array<string> = []
    const { logs, layer: logger } = recordLogs()
    // Only the first read of each handler returns, empty: any other store call dies, which the
    // consumer logs.
    const events = WorkerHttp.pipe(
      Layer.provideMerge(BunHttpServer.layerTest),
      Layer.provide([
        Layer.mock(MessageRepository, {
          selectOne: () =>
            Effect.sync(() => {
              reads.push('messages')
            }).pipe(Effect.as(Option.none())),
        }),
        Layer.mock(RunRepository, {
          selectOne: () =>
            Effect.sync(() => {
              reads.push('runs')
            }).pipe(Effect.as(Option.none())),
        }),
        Layer.mock(ChatRepository, {}),
        Layer.mock(MessageAssistant, {}),
        Layer.mock(ChatAssistant, {}),
        TransactionTest,
      ]),
      Layer.provide(
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

      const response = yield* HttpClientRequest.post('/events').pipe(
        HttpClientRequest.bodyJsonUnsafe({ Records: [record] }),
        HttpClient.execute,
      )

      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(yield* response.json, { batchItemFailures: [] })
      assert.deepStrictEqual(reads, [store])
      assert.isFalse(Arr.some(logs, ([, message]) => message === 'queue message failed'))
    }).pipe(Effect.provide(events))
  })
})
