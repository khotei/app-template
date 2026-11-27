import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Context, Deferred, Effect, Order, Record as Rec, Ref, Schema } from 'effect'

import { recordLogs } from '@app-template/packages/testing'

import { QueueConsumer, SqsEvent } from '#aws/queue/queue.consumer'

class Replies extends Context.Service<Replies, { readonly label: string }>()(
  '@app-template/packages/aws/queue/Replies',
) {}

class Titles extends Context.Service<Titles, { readonly label: string }>()(
  '@app-template/packages/aws/queue/Titles',
) {}

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
  it.effect('runs each decoded message and acknowledges each, one whose handler died too', () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<string>>([])
      const event: SqsEvent = {
        Records: [buildRecord('a', '{"ping":"ok"}'), buildRecord('b', '{"ping":"boom"}')],
      }

      const response = yield* QueueConsumer.consume(pingQueue, [
        ({ ping }) =>
          Ref.update(seen, Arr.append(ping)).pipe(
            Effect.andThen(ping === 'boom' ? Effect.die('boom') : Effect.void),
          ),
      ])(event)

      assert.deepStrictEqual(response, { batchItemFailures: [] })
      assert.deepStrictEqual(Arr.sort(yield* Ref.get(seen), Order.String), ['boom', 'ok'])
    }),
  )

  it.effect('runs every handler on a message, each over the services it reads', () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<ReadonlyArray<string>>([])

      yield* QueueConsumer.consume(pingQueue, [
        Effect.fnUntraced(function* ({ ping }: { readonly ping: string }) {
          const { label } = yield* Replies
          yield* Ref.update(seen, Arr.append(`${label} ${ping}`))
        }),
        Effect.fnUntraced(function* ({ ping }: { readonly ping: string }) {
          const { label } = yield* Titles
          yield* Ref.update(seen, Arr.append(`${label} ${ping}`))
        }),
      ])({ Records: [buildRecord('a', '{"ping":"ok"}')] })

      assert.deepStrictEqual(Arr.sort(yield* Ref.get(seen), Order.String), ['reply ok', 'title ok'])
    }).pipe(
      Effect.provideService(Replies, { label: 'reply' }),
      Effect.provideService(Titles, { label: 'title' }),
    ),
  )

  it.effect("runs a message's handlers at once, so one may wait on another", () =>
    Effect.gen(function* () {
      const titled = yield* Deferred.make<void>()

      yield* QueueConsumer.consume(pingQueue, [
        () => Deferred.await(titled),
        () => Deferred.succeed(titled, undefined),
      ])({ Records: [buildRecord('a', '{"ping":"ok"}')] })

      assert.isTrue(yield* Deferred.isDone(titled))
    }),
  )

  it.effect(
    "runs a message's other handlers to their end when one dies, and logs its defect",
    () => {
      const { logs, layer: logger } = recordLogs('queueMessageId')
      return Effect.gen(function* () {
        const seen = yield* Ref.make<ReadonlyArray<string>>([])

        yield* QueueConsumer.consume(pingQueue, [
          () => Effect.die('boom'),
          ({ ping }) => Effect.yieldNow.pipe(Effect.andThen(Ref.update(seen, Arr.append(ping)))),
        ])({ Records: [buildRecord('a', '{"ping":"ok"}')] })

        assert.deepStrictEqual(yield* Ref.get(seen), ['ok'])
        assert.deepStrictEqual(logs, [['Error', 'queue message failed', 'a']])
      }).pipe(Effect.provide(logger))
    },
  )

  it.effect("runs a message in its sender's trace, and one sent outside a trace in its own", () =>
    Effect.gen(function* () {
      const traceIds = yield* Ref.make<Record<string, string>>({})
      const traceId = '0af7651916cd43dd8448eb211c80319c'

      const response = yield* QueueConsumer.consume(pingQueue, [
        ({ ping }) =>
          Effect.currentSpan.pipe(
            Effect.orDie,
            Effect.flatMap((span) => Ref.update(traceIds, Rec.set(ping, span.traceId))),
          ),
      ])({
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
      const response = yield* QueueConsumer.consume(pingQueue, [() => Effect.die('handler ran')])({
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
