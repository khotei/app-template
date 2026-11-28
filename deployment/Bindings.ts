import * as AWS from '@alchemy.run/aws'
import { Effect, Layer, pipe, Record } from 'effect'

import { QueueError, QueueSender } from '@app-template/packages/aws/queue'

import { Queues } from '#deployment/Queues'

type Send = Effect.Success<ReturnType<typeof AWS.SQS.SendMessage>>

/**
 * The app's `QueueSender` over Alchemy's `SendMessage`, one binding for each queue, so the
 * function that builds it may send to them all.
 */
export const QueueSenderFromBindings = Effect.gen(function* () {
  const senders: Record<string, Send> = yield* pipe(
    yield* Queues,
    Record.map((queue) => AWS.SQS.SendMessage(queue)),
    Effect.all,
  )

  return QueueSender.layer((queue, { body, traceparent }) =>
    pipe(
      Record.get(senders, queue),
      Effect.fromOption,
      Effect.orDie,
      Effect.flatMap((send) =>
        send({
          MessageBody: body,
          MessageAttributes: { traceparent: { DataType: 'String', StringValue: traceparent } },
        }).pipe(Effect.mapError((cause) => new QueueError({ cause }))),
      ),
    ),
  )
}).pipe(Layer.unwrap)
