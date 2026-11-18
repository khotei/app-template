import { SQSService } from '@effect-aws/client-sqs'
import { Cache, Context, Duration, Effect, Exit, Layer, Schema } from 'effect'
import { HttpTraceContext } from 'effect/http'

import type { QueueDefinition } from '#queue/queue.model'

export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
  cause: Schema.Defect(),
}) {}

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
>()('@app-template/packages/queue/QueueSender') {
  /** `buildName` turns a definition's name into its queue's. */
  static readonly layer = (
    buildName: (name: string) => string,
  ): Layer.Layer<QueueSender, never, SQSService> =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const sqs = yield* SQSService
        const urls = yield* Cache.makeWith(
          (queue: string) =>
            sqs
              .getQueueUrl({ QueueName: queue })
              .pipe(Effect.flatMap(({ QueueUrl }) => Effect.fromNullishOr(QueueUrl))),
          {
            capacity: Number.POSITIVE_INFINITY,
            timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
          },
        )

        const send = Effect.fn('QueueSender.send')(
          function* <A, I>(definition: QueueDefinition<Schema.Codec<A, I>>, message: A) {
            const body = yield* Schema.encodeEffect(
              Schema.fromJsonString(Schema.toCodecJson(definition.schema)),
            )(message).pipe(Effect.orDie)
            const url = yield* Cache.get(urls, buildName(definition.name))
            const span = yield* Effect.currentSpan.pipe(Effect.orDie)
            const { traceparent } = HttpTraceContext.toHeaders(span)
            yield* sqs.sendMessage({
              QueueUrl: url,
              MessageBody: body,
              MessageAttributes: { traceparent: { DataType: 'String', StringValue: traceparent } },
            })
          },
          Effect.mapError((cause) => new QueueError({ cause })),
        )

        return { send }
      }),
    )
}
