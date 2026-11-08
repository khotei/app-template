import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Duration, Effect, Layer, Ref, Schema } from 'effect'

import { handleBatch, type QueueDefinition, type SqsEvent } from '#queue/queue'
import { QueueTransport, type VisibilityChange } from '#queue/queue.transport'

class Ping extends Schema.Class<Ping>('Ping')({ text: Schema.String }) {}

const definition = {
  name: 'pings',
  schema: Ping,
  maxAttempts: 3,
  retryDelay: (attempt) => Duration.seconds(attempt * 10),
  jobId: (ping) => ping.text,
} satisfies QueueDefinition<typeof Ping>

const buildRecord = (messageId: string, { body = '{"text":"ok"}', receiveCount = 1 } = {}) => ({
  messageId,
  receiptHandle: `handle-${messageId}`,
  body,
  attributes: { ApproximateReceiveCount: receiveCount },
  messageAttributes: { jobId: { stringValue: messageId } },
  eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:stage-pings',
})

const failOn = (text: string) => (ping: Ping) =>
  ping.text === text ? Effect.fail('handler failed') : Effect.void

function recordVisibility() {
  const changes = Ref.makeUnsafe<ReadonlyArray<{ queue: string } & VisibilityChange>>([])
  const layer = Layer.succeed(
    QueueTransport,
    QueueTransport.of({
      send: () => Effect.die('not sent in a batch'),
      receive: () => Effect.die('not received in a batch'),
      delete: () => Effect.die('Lambda deletes a batch'),
      extend: (queue, change) => Ref.update(changes, Arr.append({ queue, ...change })),
    }),
  )
  return { changes: Ref.get(changes), layer }
}

describe('handleBatch', () => {
  it.effect('reports only the failed record and hides it for its retry delay', () => {
    const transport = recordVisibility()
    const event: SqsEvent = {
      Records: [buildRecord('a'), buildRecord('b', { body: '{"text":"boom"}', receiveCount: 2 })],
    }
    return Effect.gen(function* () {
      const response = yield* handleBatch(definition, failOn('boom'))(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'b' }] })
      assert.deepStrictEqual(yield* transport.changes, [
        { queue: 'stage-pings', handle: 'handle-b', visibility: Duration.seconds(20) },
      ])
    }).pipe(Effect.provide(transport.layer))
  })

  it.effect('releases a failed last attempt at once, for the redrive', () => {
    const transport = recordVisibility()
    const event: SqsEvent = {
      Records: [buildRecord('a', { body: '{"text":"boom"}', receiveCount: 3 })],
    }
    return Effect.gen(function* () {
      const response = yield* handleBatch(definition, failOn('boom'))(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'a' }] })
      assert.deepStrictEqual(yield* transport.changes, [
        { queue: 'stage-pings', handle: 'handle-a', visibility: 0 },
      ])
    }).pipe(Effect.provide(transport.layer))
  })

  it.effect('reports a body that does not decode, without running the handler', () => {
    const transport = recordVisibility()
    const event: SqsEvent = { Records: [buildRecord('a', { body: 'not json' })] }
    return Effect.gen(function* () {
      const response = yield* handleBatch(definition, () => Effect.die('handler ran'))(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'a' }] })
    }).pipe(Effect.provide(transport.layer))
  })
})
