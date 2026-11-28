import { SQSService } from '@effect-aws/client-sqs'
import { Context, Effect, Layer, type Schema } from 'effect'
import { HttpTraceContext } from 'effect/http'

import { SchemaCodec } from '@app-template/packages/schema'

import { QueueClient } from '#aws/queue/queue.client'
import { type QueueDefinition, QueueMessage } from '#aws/queue/queue-definition'
import { QueueError } from '#aws/queue/queue-error'

/** A queue message as its transport takes it: the encoded body and the trace it was sent in. */
export interface QueueSenderMessage {
  readonly body: string
  readonly traceparent: string
}

export class QueueSender extends Context.Service<
  QueueSender,
  {
    /**
     * Sends `message`, encoded by the definition's schema, to the definition's queue, with the
     * current trace as its `traceparent` attribute, so its consumer runs in the same trace.
     */
    readonly send: <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) => Effect.Effect<void, QueueError>
  }
>()('@app-template/packages/aws/queue/QueueSender') {
  /** `sendTo` hands the queue a definition names its encoded message: the transport. */
  static readonly layer = (
    sendTo: (queue: string, message: QueueSenderMessage) => Effect.Effect<void, QueueError>,
  ): Layer.Layer<QueueSender> =>
    Layer.succeed(this, {
      send: Effect.fn('QueueSender.send')(function* <A, I>(
        definition: QueueDefinition<Schema.Codec<A, I>>,
        message: A,
      ) {
        const body = yield* SchemaCodec.encode(QueueMessage.buildCodec(definition))(message)
        const span = yield* Effect.currentSpan.pipe(Effect.orDie)
        const traceparent = yield* Effect.fromNullishOr(
          HttpTraceContext.toHeaders(span).traceparent,
        ).pipe(Effect.orDie)

        yield* sendTo(definition.name, { body, traceparent })
      }),
    })

  /** Over SQS: `buildName` turns a definition's name into its queue's. */
  static readonly layerSqs = (
    buildName: (name: string) => string,
  ): Layer.Layer<QueueSender, never, SQSService> =>
    Effect.gen(function* () {
      const sqs = yield* SQSService
      const client = yield* QueueClient

      return QueueSender.layer(
        Effect.fnUntraced(function* (queue, { body, traceparent }) {
          const url = yield* client.getUrl(buildName(queue))
          yield* sqs
            .sendMessage({
              QueueUrl: url,
              MessageBody: body,
              MessageAttributes: { traceparent: { DataType: 'String', StringValue: traceparent } },
            })
            .pipe(Effect.mapError((cause) => new QueueError({ cause })))
        }),
      )
    }).pipe(Layer.unwrap, Layer.provide(QueueClient.layer))
}
