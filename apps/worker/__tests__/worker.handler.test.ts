import { BunHttpServer } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { ConfigProvider, Effect, Layer, Option } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'

import { ChatAssistant, MessageAssistant } from '@app-template/application/chat'
import { chatId, firstMessage, owner } from '@app-template/application/chat/testing'
import {
  ChatRepository,
  type MessageEntityWhere,
  MessageRepository,
  RunRepository,
} from '@app-template/kernel/data'
import { TransactionTest } from '@app-template/packages/db/testing'

import { WorkerHttp } from '#worker/layer'

const buildRecord = (queue: string, body: unknown) => ({
  messageId: 'a',
  body: JSON.stringify(body),
  eventSourceARN: `arn:aws:sqs:us-east-1:000000000000:${queue}`,
  messageAttributes: {},
})

describe('POST /events', () => {
  it.effect('runs a batch on the handler of the queue it came from', () => {
    const reads: Array<MessageEntityWhere> = []
    // Only the title's first read returns: any other store call dies.
    const events = WorkerHttp.pipe(
      Layer.provideMerge(BunHttpServer.layerTest),
      Layer.provide([
        Layer.mock(MessageRepository, {
          selectOne: (where) =>
            Effect.sync(() => {
              reads.push(where)
            }).pipe(Effect.as(Option.none())),
        }),
        Layer.mock(ChatRepository, {}),
        Layer.mock(RunRepository, {}),
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
    )
    return Effect.gen(function* () {
      const record = buildRecord('app-template-test-first-message-created', {
        id: firstMessage.id,
        chatId,
        userId: owner,
      })

      const response = yield* HttpClientRequest.post('/events').pipe(
        HttpClientRequest.bodyJsonUnsafe({ Records: [record] }),
        HttpClient.execute,
      )

      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(yield* response.json, { batchItemFailures: [] })
      assert.deepStrictEqual(reads, [{ id: firstMessage.id, chatId, userId: owner }])
    }).pipe(Effect.provide(events))
  })
})
