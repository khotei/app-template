import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Schema } from 'effect'

import { QueueSender, type QueueSenderMessage } from '#aws/queue/queue.sender'
import type { QueueDefinition } from '#aws/queue/queue-definition'

class OrderShipped extends Schema.Class<OrderShipped>('OrderShipped')({
  orderId: Schema.String,
  shippedAt: Schema.DateTimeUtcFromDate,
}) {}

const orderShipped = {
  name: 'order-shipped',
  schema: OrderShipped,
} satisfies QueueDefinition<typeof OrderShipped>

describe('QueueSender', () => {
  it.effect("hands its send the definition's queue, the encoded body and the current trace", () => {
    const sent: Array<readonly [string, QueueSenderMessage]> = []
    const record = (queue: string, message: QueueSenderMessage) =>
      Effect.sync(() => {
        sent.push([queue, message])
      })
    return Effect.gen(function* () {
      const sender = yield* QueueSender
      const { traceId } = yield* Effect.currentSpan.pipe(Effect.orDie)

      yield* sender.send(
        orderShipped,
        new OrderShipped({
          orderId: 'a',
          shippedAt: DateTime.makeUnsafe('2026-01-02T03:04:05.000Z'),
        }),
      )

      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0]?.[0], 'order-shipped')
      assert.deepStrictEqual(JSON.parse(String(sent[0]?.[1].body)), {
        orderId: 'a',
        shippedAt: '2026-01-02T03:04:05.000Z',
      })
      assert.match(String(sent[0]?.[1].traceparent), new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`))
    }).pipe(Effect.withSpan('test'), Effect.provide(QueueSender.layer(record)))
  })
})
