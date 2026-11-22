import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Order, Record as Rec, Ref, Schema } from 'effect'

import { recordLogs } from '@app-template/packages/testing'

import { consumeQueue, SqsEvent } from '#queue/queue.consumer'

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

describe('consumeQueue', () => {
  it.effect('runs each decoded message and returns only the record whose handler died', () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const event: SqsEvent = {
        Records: [buildRecord('a', '{"ping":"ok"}'), buildRecord('b', '{"ping":"boom"}')],
      }

      const response = yield* consumeQueue(pingQueue, ({ ping }) =>
        Ref.update(seen, Arr.append(ping)).pipe(
          Effect.andThen(ping === 'boom' ? Effect.die('boom') : Effect.void),
        ),
      )(event)

      assert.deepStrictEqual(response, { batchItemFailures: [{ itemIdentifier: 'b' }] })
      assert.deepStrictEqual(Arr.sort(yield* Ref.get(seen), Order.String), ['boom', 'ok'])
    }),
  )

  it.effect("runs a message in its sender's trace, and one sent outside a trace in its own", () =>
    Effect.gen(function* () {
      const traceIds = yield* Ref.make<Record<string, string>>({})
      const traceId = '0af7651916cd43dd8448eb211c80319c'

      const response = yield* consumeQueue(pingQueue, ({ ping }) =>
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
      assert.deepStrictEqual(response, { batchItemFailures: [] })
      assert.strictEqual(traced, traceId)
      assert.notStrictEqual(untraced, traceId)
    }),
  )

  it.effect('decodes an event whose traceparent attribute holds no string', () =>
    Effect.gen(function* () {
      const event = yield* Schema.decodeUnknownEffect(SqsEvent)({
        Records: [
          {
            ...buildRecord('a', '{"ping":"ok"}'),
            messageAttributes: { traceparent: { dataType: 'Binary', binaryValue: 'AA==' } },
          },
        ],
      })

      assert.strictEqual(event.Records.length, 1)
    }),
  )

  it.effect('acknowledges a body that does not decode, unrun, and logs its decode error', () => {
    const { logs, layer: logger } = recordLogs('queueMessageId')
    return Effect.gen(function* () {
      const response = yield* consumeQueue(pingQueue, () => Effect.die('handler ran'))({
        Records: [buildRecord('a', '{"ping":1}')],
      })

      assert.deepStrictEqual(response, { batchItemFailures: [] })
      assert.deepStrictEqual(
        Arr.map(logs, ([level, message, queueMessageId, error]) => [
          level,
          message,
          queueMessageId,
          Schema.isSchemaError(error),
        ]),
        [['Error', 'queue message does not decode', 'a', true]],
      )
    }).pipe(Effect.provide(logger))
  })
})
