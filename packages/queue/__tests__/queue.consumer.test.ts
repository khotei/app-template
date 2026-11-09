import { assert, describe, it } from '@effect/vitest'
import { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Effect, Layer, Ref, Schema } from 'effect'

import { QueueConsumer, type SqsEvent } from '#queue/queue.consumer'
import type { QueueDefinition } from '#queue/queue.model'

class Ping extends Schema.Class<Ping>('Ping')({ text: Schema.String }) {}

const definition = {
  name: 'pings',
  schema: Ping,
  maxAttempts: 3,
  retryDelay: (attempt) => `${attempt * 10} seconds`,
} satisfies QueueDefinition<typeof Ping>

function buildRecord(messageId: string, { body = '{"text":"ok"}', receiveCount = 1 } = {}) {
  return {
    messageId,
    receiptHandle: `handle-${messageId}`,
    body,
    attributes: { ApproximateReceiveCount: receiveCount },
    messageAttributes: { jobId: { stringValue: messageId } },
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:stage-pings',
  }
}

type VisibilityChange = Parameters<SQSService['Service']['changeMessageVisibility']>[0]

function failOnBoom(body: string) {
  return body === '{"text":"boom"}' ? Effect.fail('failed') : Effect.void
}

function recordVisibility() {
  const changes = Ref.makeUnsafe<ReadonlyArray<VisibilityChange>>([])
  const sqs = Layer.mock(SQSService, {
    getQueueUrl: ({ QueueName }) => Effect.succeed({ QueueUrl: `url-${QueueName}`, $metadata: {} }),
    changeMessageVisibility: (args) =>
      Ref.update(changes, Arr.append(args)).pipe(Effect.as({ $metadata: {} })),
  })
  return { changes: Ref.get(changes), layer: QueueConsumer.layer.pipe(Layer.provide(sqs)) }
}

describe('QueueConsumer.consume', () => {
  it.effect('answers only the record whose handler failed and hides it for its retry delay', () => {
    const sqs = recordVisibility()
    const event: SqsEvent = {
      Records: [buildRecord('a'), buildRecord('b', { body: '{"text":"boom"}', receiveCount: 2 })],
    }
    return Effect.gen(function* () {
      const consumer = yield* QueueConsumer

      const response = yield* consumer.consume(definition, failOnBoom)(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'b' }] })
      assert.deepStrictEqual(yield* sqs.changes, [
        { QueueUrl: 'url-stage-pings', ReceiptHandle: 'handle-b', VisibilityTimeout: 20 },
      ])
    }).pipe(Effect.provide(sqs.layer))
  })

  it.effect('releases a failed last attempt at once, for the dead-letter queue', () => {
    const sqs = recordVisibility()
    const event: SqsEvent = {
      Records: [buildRecord('a', { body: '{"text":"boom"}', receiveCount: 3 })],
    }
    return Effect.gen(function* () {
      const consumer = yield* QueueConsumer

      const response = yield* consumer.consume(definition, failOnBoom)(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'a' }] })
      assert.deepStrictEqual(yield* sqs.changes, [
        { QueueUrl: 'url-stage-pings', ReceiptHandle: 'handle-a', VisibilityTimeout: 0 },
      ])
    }).pipe(Effect.provide(sqs.layer))
  })
})
