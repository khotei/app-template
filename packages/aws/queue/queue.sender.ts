import { SQSService } from '@effect-aws/client-sqs'
import { Context, Effect, Layer, type Schema } from 'effect'
import { HttpTraceContext } from 'effect/http'

import { SchemaCodec } from '@app-template/packages/schema'

import { QueueClient } from '#aws/queue/queue.client'
import { type QueueDefinition, QueueMessage } from '#aws/queue/queue-definition'
import { QueueError } from '#aws/queue/queue-error'

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
>()('@app-template/packages/aws/queue/QueueSender', {
  make: Effect.fnUntraced(function* (buildName: (name: string) => string) {
    const sqs = yield* SQSService
    const client = yield* QueueClient

    const send = Effect.fn('QueueSender.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* SchemaCodec.encode(QueueMessage.buildCodec(definition))(message)
      const url = yield* client.getUrl(buildName(definition.name))
      const span = yield* Effect.currentSpan.pipe(Effect.orDie)
      const { traceparent } = HttpTraceContext.toHeaders(span)
      yield* sqs
        .sendMessage({
          QueueUrl: url,
          MessageBody: body,
          MessageAttributes: { traceparent: { DataType: 'String', StringValue: traceparent } },
        })
        .pipe(Effect.mapError((cause) => new QueueError({ cause })))
    })

    return { send }
  }),
}) {
  /** `buildName` turns a definition's name into its queue's. */
  static readonly layer = (
    buildName: (name: string) => string,
  ): Layer.Layer<QueueSender, never, SQSService> =>
    Layer.effect(this, this.make(buildName)).pipe(Layer.provide(QueueClient.layer))
}
