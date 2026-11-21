import { Effect, Layer } from 'effect'

import { QueueError, QueueSender } from '@app-template/packages/queue'

/** A `QueueSender` that SQS refuses with "SQS is unavailable", once `before` has run. */
export const layerRefusingQueueTest = (before: Effect.Effect<void> = Effect.void) =>
  Layer.mock(QueueSender, {
    send: () =>
      before.pipe(
        Effect.andThen(Effect.fail(new QueueError({ cause: new Error('SQS is unavailable') }))),
      ),
  })
