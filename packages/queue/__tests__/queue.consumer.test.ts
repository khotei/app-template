import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Order, Record as Rec, Ref, Schema } from 'effect'

import { QueueConsumer, type SqsEvent } from '#queue/queue.consumer'

const pingQueue = { name: 'pings', schema: Schema.Struct({ ping: Schema.String }) }

function buildRecord(
  messageId: string,
  body: string,
  messageAttributes: SqsEvent['Records'][number]['messageAttributes'] = {},
) {
  return {
    messageId,
    body,
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:stage-pings',
    messageAttributes,
  }
}

describe('QueueConsumer.consume', () => {
  it.effect('runs each decoded message and answers only the record whose handler died', () =>
    Effect.gen(function* () {
      const consumer = yield* QueueConsumer
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const event: SqsEvent = {
        Records: [buildRecord('a', '{"ping":"ok"}'), buildRecord('b', '{"ping":"boom"}')],
      }

      const response = yield* consumer.consume(pingQueue, ({ ping }) =>
        Ref.update(seen, Arr.append(ping)).pipe(
          Effect.andThen(ping === 'boom' ? Effect.die('boom') : Effect.void),
        ),
      )(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'b' }] })
      assert.deepStrictEqual(Arr.sort(yield* Ref.get(seen), Order.String), ['boom', 'ok'])
    }).pipe(Effect.provide(QueueConsumer.layer)),
  )

  it.effect("runs a message in its sender's trace, and one sent outside a trace in its own", () =>
    Effect.gen(function* () {
      const consumer = yield* QueueConsumer
      const traceIds = yield* Ref.make<Record<string, string>>({})
      const traceId = '0af7651916cd43dd8448eb211c80319c'

      yield* consumer.consume(pingQueue, ({ ping }) =>
        Effect.currentSpan.pipe(
          Effect.orDie,
          Effect.flatMap((span) => Ref.update(traceIds, Rec.set(ping, span.traceId))),
        ),
      )({
        Records: [
          buildRecord('a', '{"ping":"traced"}', {
            traceparent: { stringValue: `00-${traceId}-b7ad6b7169203331-01` },
          }),
          buildRecord('b', '{"ping":"untraced"}'),
        ],
      })

      const { traced, untraced } = yield* Ref.get(traceIds)
      assert.strictEqual(traced, traceId)
      assert.notStrictEqual(untraced, traceId)
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
