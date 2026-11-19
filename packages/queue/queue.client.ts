import { SQSService } from '@effect-aws/client-sqs'
import { Cache, Context, Duration, Effect, Exit, Layer, Schema } from 'effect'

export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', {
  cause: Schema.Defect(),
}) {}

export class QueueClient extends Context.Service<
  QueueClient,
  {
    /** The URL of the queue named `queue`, asked of SQS once; a failed lookup is asked again. */
    readonly getUrl: (queue: string) => Effect.Effect<string, QueueError>
  }
>()('@app-template/packages/queue/QueueClient', {
  make: Effect.gen(function* () {
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

    const getUrl = Effect.fn('QueueClient.getUrl')(
      (queue: string) => Cache.get(urls, queue),
      Effect.mapError((cause) => new QueueError({ cause })),
    )

    return { getUrl }
  }),
}) {
  static readonly layer: Layer.Layer<QueueClient, never, SQSService> = Layer.effect(this, this.make)
}
