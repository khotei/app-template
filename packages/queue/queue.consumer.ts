import { SQSService } from '@effect-aws/client-sqs'
import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Result,
  Schema,
} from 'effect'

import { QueueClient } from '#queue/queue.client'
import {
  type AttemptInfo,
  buildAttemptInfo,
  buildQueueName,
  type Handler,
  type QueueDefinition,
} from '#queue/queue.model'

const SqsRecord = Schema.Struct({
  messageId: Schema.String,
  receiptHandle: Schema.String,
  body: Schema.String,
  attributes: Schema.Struct({ ApproximateReceiveCount: Schema.NumberFromString }),
  messageAttributes: Schema.Struct({ jobId: Schema.Struct({ stringValue: Schema.String }) }),
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
     * Runs `handle` on each record of a batch and answers the failed ones, which stay on the
     * queue: a failure or an undecodable body hides its record for `retryDelay`, or on the last
     * attempt makes it visible at once for the dead-letter queue.
     */
    readonly consume: <A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ) => (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R>
  }
>()('@app-template/packages/queue/QueueConsumer', {
  make: Effect.gen(function* () {
    const sqs = yield* SQSService
    const client = yield* QueueClient

    function consume<A, I, E, R>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      handle: Handler<A, E, R>,
    ): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
      const decode = Schema.decodeEffect(
        Schema.fromJsonString(Schema.toCodecJson(definition.schema)),
      )

      const retry = Effect.fnUntraced(function* (record: SqsRecord, info: AttemptInfo) {
        const delay = info.isLastAttempt ? 0 : definition.retryDelay(info.attempt)
        yield* client.getUrl(buildQueueName(record.eventSourceARN)).pipe(
          Effect.flatMap((url) =>
            sqs.changeMessageVisibility({
              QueueUrl: url,
              ReceiptHandle: record.receiptHandle,
              VisibilityTimeout: Math.ceil(Duration.toSeconds(delay)),
            }),
          ),
          Effect.tapCause((cause) => Effect.logWarning('queue retry delay failed', cause)),
          Effect.ignore,
        )
        return Option.some({ itemIdentifier: record.messageId })
      })

      const run = Effect.fnUntraced(
        function* (record: SqsRecord) {
          const info = buildAttemptInfo(record.messageAttributes.jobId.stringValue, {
            receiveCount: record.attributes.ApproximateReceiveCount,
            maxAttempts: definition.maxAttempts,
          })
          const decoded = yield* decode(record.body).pipe(Effect.result)
          if (Result.isFailure(decoded)) {
            yield* Effect.logError('queue message does not decode', decoded.failure)
            return yield* retry(record, info)
          }

          const exit = yield* handle(decoded.success, info).pipe(Effect.exit)
          if (Exit.isSuccess(exit)) return Option.none()

          yield* info.isLastAttempt
            ? Effect.logError('queue message dead-lettered', exit.cause)
            : Effect.logWarning('queue message attempt failed', exit.cause)
          return yield* retry(record, info)
        },
        (effect, record) =>
          Effect.annotateLogs(effect, {
            jobId: record.messageAttributes.jobId.stringValue,
            attempt: `${record.attributes.ApproximateReceiveCount}/${definition.maxAttempts}`,
          }),
      )

      return (event) =>
        Effect.forEach(event.Records, run, { concurrency: 'unbounded' }).pipe(
          Effect.map((failures) => ({ batchItemFailures: Arr.getSomes(failures) })),
        )
    }

    return { consume }
  }),
}) {
  static readonly layer: Layer.Layer<QueueConsumer, never, SQSService> = Layer.effect(
    this,
    this.make,
  ).pipe(Layer.provide(QueueClient.layer))
}
