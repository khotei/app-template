import { SQSService } from '@effect-aws/client-sqs'
import { Context, Effect, Layer, Schema } from 'effect'

import { QueueClient, QueueError } from '#queue/queue.client'
import type { QueueDefinition } from '#queue/queue.model'

export class QueueSender extends Context.Service<
  QueueSender,
  {
    /** Sends `message`, encoded by the definition's schema, to the definition's queue. */
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
        const client = yield* QueueClient

        const send = Effect.fn('QueueSender.send')(function* <A, I>(
          definition: QueueDefinition<Schema.Codec<A, I>>,
          message: A,
        ) {
          const body = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.toCodecJson(definition.schema)),
          )(message).pipe(Effect.orDie)
          const url = yield* client.getUrl(buildName(definition.name))
          yield* sqs
            .sendMessage({ QueueUrl: url, MessageBody: body })
            .pipe(Effect.mapError((cause) => new QueueError({ cause })))
        })

        return { send }
      }),
    ).pipe(Layer.provide(QueueClient.layer))
}
