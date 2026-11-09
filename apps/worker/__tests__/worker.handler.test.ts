import { BunHttpServer } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, ConfigProvider, Effect, Layer, Option, Ref } from 'effect'
import { HttpClient, HttpClientRequest, HttpRouter } from 'effect/http'

import { GenerateChatTitle } from '@app-template/application/chat'
import { chatId, messageId } from '@app-template/application/chat/testing'
import {
  GenerateAssistantMessageUseCase,
  GenerateChatTitleUseCase,
} from '@app-template/application/use-cases'
import { SQSServiceFromConfig } from '@app-template/kernel/aws'
import { JobRepository } from '@app-template/kernel/data'

import { WorkerHandler } from '#worker/worker.handler'

function buildRecord(queue: string, body: unknown) {
  return {
    messageId: 'a',
    receiptHandle: 'handle-a',
    body: JSON.stringify(body),
    attributes: { ApproximateReceiveCount: '1' },
    messageAttributes: { jobId: { stringValue: 'a' } },
    eventSourceARN: `arn:aws:sqs:us-east-1:000000000000:${queue}`,
  }
}

/** Every message's row is a queued job, so each runs its handler. */
const QueuedJobsTest = Layer.mock(JobRepository, {
  selectOne: () =>
    Effect.succeed(
      Option.some({
        id: 'a',
        queue: 'chat-title',
        body: {},
        status: 'queued',
        createdAt: new Date(0),
      }),
    ),
  update: () => Effect.void,
})

function recordTitles() {
  const jobs = Ref.makeUnsafe<ReadonlyArray<GenerateChatTitle>>([])
  const layer = Layer.mock(GenerateChatTitleUseCase, {
    generate: (job) => Ref.update(jobs, Arr.append(job)),
  })
  return { jobs: Ref.get(jobs), layer }
}

describe('POST /events', () => {
  it.effect('runs a batch on the steps of the queue it came from', () => {
    const titles = recordTitles()
    const events = HttpRouter.serve(WorkerHandler).pipe(
      Layer.provideMerge(BunHttpServer.layerTest),
      Layer.provide([
        titles.layer,
        Layer.mock(GenerateAssistantMessageUseCase, { generate: () => Effect.die('wrong queue') }),
        QueuedJobsTest,
        SQSServiceFromConfig,
      ]),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ AWS_REGION: 'us-east-1', STAGE: 'test' }),
        ),
      ),
    )
    return Effect.gen(function* () {
      const record = buildRecord('app-template-test-chat-title', { chatId, messageId })

      const response = yield* HttpClientRequest.post('/events').pipe(
        HttpClientRequest.bodyJsonUnsafe({ Records: [record] }),
        HttpClient.execute,
      )

      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(yield* response.json, { batchItemFailures: [] })
      assertEquals(yield* titles.jobs, [new GenerateChatTitle({ chatId, messageId })])
    }).pipe(Effect.provide(events))
  })
})
