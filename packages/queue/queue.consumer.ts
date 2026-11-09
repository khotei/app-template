import { Array as Arr, Context, Effect, Exit, Layer, Option, Schema } from 'effect'

import type { QueueDefinition } from '#queue/queue.model'

const SqsRecord = Schema.Struct({
  messageId: Schema.String,
  body: Schema.String,
  eventSourceARN: Schema.String,
})

type SqsRecord = typeof SqsRecord.Type

/** The event an SQS event source mapping invokes a function with. */
export const SqsEvent = Schema.Struct({ Records: Schema.Array(SqsRecord) })

export type SqsEvent = typeof SqsEvent.Type

export interface SqsBatchResponse {
  readonly batchItemFailures: ReadonlyArray<{ readonly itemIdentifier: string }>
}

export class QueueConsumer extends Context.Service<
  QueueConsumer,
  {
    /**
     * Runs `handle` on each record's message, decoded by the definition's schema, and answers the
     * records whose handler died: SQS delivers them again until the queue's `maxReceiveCount`
     * dead-letters them. A handler has no error channel, so it settles its work's failure itself.
     * A body that does not decode never will, so it is logged and acknowledged, unrun.
     */
    readonly consume: <A, I, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: (message: A) => Effect.Effect<unknown, never, R>,
    ) => (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R>
  }
>()('@app-template/packages/queue/QueueConsumer', {
  make: Effect.gen(function* () {
    function consume<A, I, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: (message: A) => Effect.Effect<unknown, never, R>,
    ): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
      const decode = Schema.decodeEffect(
        Schema.fromJsonString(Schema.toCodecJson(definition.schema)),
      )

      function run(record: SqsRecord) {
        return decode(record.body).pipe(
          Effect.matchEffect({
            // TODO: the work this body named stays as it was (a queued reply keeps its chat busy).
            onFailure: (error) => Effect.logError('queue message does not decode', error),
            onSuccess: handle,
          }),
          Effect.tapCause((cause) => Effect.logError('queue message failed', cause)),
          Effect.annotateLogs({ messageId: record.messageId }),
          Effect.exit,
          Effect.map((exit) =>
            Exit.isSuccess(exit)
              ? Option.none()
              : Option.some({ itemIdentifier: record.messageId }),
          ),
        )
      }

      return (event) =>
        Effect.forEach(event.Records, run, { concurrency: 'unbounded' }).pipe(
          Effect.map((failures) => ({ batchItemFailures: Arr.getSomes(failures) })),
        )
    }

    return { consume }
  }),
}) {
  static readonly layer: Layer.Layer<QueueConsumer> = Layer.effect(this, this.make)
}
