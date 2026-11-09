import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { QueueConsumer, type SqsEvent } from '#queue/queue.consumer'

function buildRecord(messageId: string, body: string) {
  return {
    messageId,
    body,
    messageAttributes: { jobId: { stringValue: messageId } },
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:stage-pings',
  }
}

describe('QueueConsumer.consume', () => {
  it.effect('answers only the record whose handler failed', () =>
    Effect.gen(function* () {
      const consumer = yield* QueueConsumer
      const event: SqsEvent = { Records: [buildRecord('a', 'ok'), buildRecord('b', 'boom')] }

      const response = yield* consumer.consume((body) =>
        body === 'boom' ? Effect.fail('failed') : Effect.void,
      )(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'b' }] })
    }).pipe(Effect.provide(QueueConsumer.layer)),
  )
})
