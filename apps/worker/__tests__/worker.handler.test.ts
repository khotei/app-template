import { BunCrypto, BunHttpServer } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { ConfigProvider, Effect, Layer, Option } from 'effect'
import { HttpClient, HttpClientRequest, HttpRouter } from 'effect/http'

import { ChatService, MessageService, RunService } from '@app-template/application/chat'
import { messageId, recordAssistant } from '@app-template/application/chat/testing'
import {
  ChatRepository,
  FileRepository,
  type MessageEntityWhere,
  MessageRepository,
  RunRepository,
} from '@app-template/kernel/data'
import { TransactionTest } from '@app-template/packages/db/testing'

import { WorkerHandler } from '#worker/worker.handler'

const buildRecord = (queue: string, body: unknown) => ({
  messageId: 'a',
  body: JSON.stringify(body),
  eventSourceARN: `arn:aws:sqs:us-east-1:000000000000:${queue}`,
  messageAttributes: {},
})

describe('POST /events', () => {
  it.effect('runs a batch on the use case of the queue it came from', () => {
    const reads: Array<MessageEntityWhere> = []
    // Only the title job's first read answers: any other store call dies, and fails the batch.
    const events = HttpRouter.serve(WorkerHandler).pipe(
      Layer.provideMerge(BunHttpServer.layerTest),
      Layer.provide([ChatService.layer, MessageService.layer, RunService.layer]),
      Layer.provide([
        Layer.mock(MessageRepository, {
          selectOne: (where) =>
            Effect.sync(() => {
              reads.push(where)
            }).pipe(Effect.as(Option.none())),
        }),
        Layer.mock(ChatRepository, {}),
        Layer.mock(RunRepository, {}),
        Layer.mock(FileRepository, {}),
        recordAssistant({}).layer,
        TransactionTest,
        BunCrypto.layer,
      ]),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ AWS_REGION: 'us-east-1', STAGE: 'test' }),
        ),
      ),
    )
    return Effect.gen(function* () {
      const record = buildRecord('app-template-test-chat-title', { messageId })

      const response = yield* HttpClientRequest.post('/events').pipe(
        HttpClientRequest.bodyJsonUnsafe({ Records: [record] }),
        HttpClient.execute,
      )

      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(yield* response.json, { batchItemFailures: [] })
      assert.deepStrictEqual(reads, [{ id: messageId }])
    }).pipe(Effect.provide(events))
  })
})
