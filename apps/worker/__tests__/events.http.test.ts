import { BunHttpServer } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Layer } from 'effect'
import { HttpClient, HttpClientRequest, HttpRouter } from 'effect/http'

import type { SqsEvent } from '@app-template/packages/queue-2'

import { addEventsRoute } from '#worker/events.http'

const buildRecord = (messageId: string, queue: string) => ({
  messageId,
  receiptHandle: `handle-${messageId}`,
  body: '{}',
  attributes: { ApproximateReceiveCount: '1' },
  messageAttributes: { jobId: { stringValue: messageId } },
  eventSourceARN: `arn:aws:sqs:us-east-1:000000000000:${queue}`,
})

const failEvery = (event: SqsEvent) =>
  Effect.succeed({
    batchItemFailures: Arr.map(event.Records, (record) => ({ itemIdentifier: record.messageId })),
  })

const EventsTest = HttpRouter.serve(
  addEventsRoute({ 'stage-pings': failEvery, 'stage-pongs': () => Effect.die('wrong queue') }),
).pipe(Layer.provideMerge(BunHttpServer.layerTest))

describe('POST /events', () => {
  it.effect('answers the batch with the failures of its own queue’s consumer', () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post('/events').pipe(
        HttpClientRequest.bodyJsonUnsafe({ Records: [buildRecord('a', 'stage-pings')] }),
        HttpClient.execute,
      )

      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(yield* response.json, { batchItemFailures: [{ itemIdentifier: 'a' }] })
    }).pipe(Effect.provide(EventsTest)),
  )
})
