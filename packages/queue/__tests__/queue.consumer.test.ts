import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Order, Ref, Schema } from 'effect'

import { QueueConsumer, type SqsEvent } from '#queue/queue.consumer'

const pingQueue = { name: 'pings', schema: Schema.Struct({ ping: Schema.String }) }

function buildRecord(messageId: string, body: string) {
  return {
    messageId,
    body,
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:stage-pings',
  }
}

describe('QueueConsumer.consume', () => {
  it.effect('runs each decoded message and answers only the record whose handler failed', () =>
    Effect.gen(function* () {
      const consumer = yield* QueueConsumer
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const event: SqsEvent = {
        Records: [buildRecord('a', '{"ping":"ok"}'), buildRecord('b', '{"ping":"boom"}')],
      }

      const response = yield* consumer.consume(pingQueue, ({ ping }) =>
        Ref.update(seen, Arr.append(ping)).pipe(
          Effect.andThen(ping === 'boom' ? Effect.fail('failed') : Effect.void),
        ),
      )(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'b' }] })
      assert.deepStrictEqual(Arr.sort(yield* Ref.get(seen), Order.String), ['boom', 'ok'])
    }).pipe(Effect.provide(QueueConsumer.layer)),
  )

  it.effect('acknowledges a body that does not decode, unrun', () =>
    Effect.gen(function* () {
      const consumer = yield* QueueConsumer

      const response = yield* consumer.consume(pingQueue, () => Effect.die('handler ran'))({
        Records: [buildRecord('a', '{"ping":1}')],
      })

      assert.deepStrictEqual(response, { batchItemFailures: [] })
    }).pipe(Effect.provide(QueueConsumer.layer)),
  )
})
