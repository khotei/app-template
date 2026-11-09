import { SQSService } from '@effect-aws/client-sqs'
import { Context, Effect, Layer } from 'effect'

import { QueueClient, QueueError } from '#queue/queue.client'

export interface MessageContent {
  readonly body: string
  /** The `jobs` row the message carries, for the handler's status and the logs. */
  readonly jobId: string
}

export class QueueSender extends Context.Service<
  QueueSender,
  { readonly send: (queue: string, message: MessageContent) => Effect.Effect<void, QueueError> }
>()('@app-template/packages/queue/QueueSender', {
  make: Effect.gen(function* () {
    const sqs = yield* SQSService
    const client = yield* QueueClient

    const send = Effect.fn('QueueSender.send')(
      function* (queue: string, message: MessageContent) {
        const url = yield* client.getUrl(queue)
        yield* sqs.sendMessage({
          QueueUrl: url,
          MessageBody: message.body,
          MessageAttributes: { jobId: { DataType: 'String', StringValue: message.jobId } },
        })
      },
      Effect.mapError((cause) => new QueueError({ cause })),
    )

    return { send }
  }),
}) {
  static readonly layer: Layer.Layer<QueueSender, never, SQSService> = Layer.effect(
    this,
    this.make,
  ).pipe(Layer.provide(QueueClient.layer))
}
