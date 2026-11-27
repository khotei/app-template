import { Array as Arr, Cause, Effect, Option, Schema, String as Str } from 'effect'
import { Headers, HttpTraceContext } from 'effect/http'

import { type QueueDefinition, QueueMessage } from '#aws/queue/queue-definition'

const SqsRecord = Schema.Struct({
  messageId: Schema.String,
  body: Schema.String,
  eventSourceARN: Schema.String,
  /** `traceparent` is the trace `QueueSender` sent the message in. */
  messageAttributes: Schema.Struct({
    traceparent: Schema.optionalKey(
      Schema.Struct({ stringValue: Schema.optionalKey(Schema.String) }),
    ),
  }),
})

type SqsRecord = typeof SqsRecord.Type

/** The event an SQS event source mapping invokes a function with. */
export const SqsEvent = Schema.Struct({ Records: Schema.Array(SqsRecord) })

export type SqsEvent = typeof SqsEvent.Type

export interface SqsBatchResponse {
  readonly batchItemFailures: ReadonlyArray<{ readonly itemIdentifier: string }>
}

/** How the worker runs a queue's handlers on the records SQS invokes it with. */
export class QueueConsumer {
  /** The name of the queue an ARN names. */
  static readonly buildQueueName = (arn: string): string => Arr.lastNonEmpty(Str.split(arn, ':'))

  /**
   * Runs every handler on each record's message and acknowledges every record, so a redelivery,
   * after the process died under one, runs every handler again. An interrupt returns no response.
   */
  static consume<
    A,
    I,
    H extends Arr.NonEmptyReadonlyArray<(message: A) => Effect.Effect<unknown, never, unknown>>,
  >(
    definition: QueueDefinition<Schema.Codec<A, I>>,
    handlers: H,
  ): (
    event: SqsEvent,
  ) => Effect.Effect<SqsBatchResponse, never, Effect.Services<ReturnType<H[number]>>>
  // One `R` infers only the first handler's services; the signature above takes their union.
  static consume<A, I, R>(
    definition: QueueDefinition<Schema.Codec<A, I>>,
    handlers: Arr.NonEmptyReadonlyArray<(message: A) => Effect.Effect<unknown, never, R>>,
  ): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
    const decode = Schema.decodeEffect(QueueMessage.buildCodec(definition))

    const runHandlers = (message: A) =>
      Effect.forEach(
        handlers,
        (handle) =>
          handle(message).pipe(
            Effect.tapCause((cause) => Effect.logError('queue message failed', cause)),
            Effect.exit,
          ),
        { concurrency: 'unbounded', discard: true },
      )

    function run(record: SqsRecord) {
      const sender = Option.fromUndefinedOr(record.messageAttributes.traceparent).pipe(
        Option.flatMap(({ stringValue }) =>
          HttpTraceContext.w3c(Headers.fromInput({ traceparent: stringValue })),
        ),
      )
      return decode(record.body).pipe(
        Effect.matchEffect({
          onFailure: (error) => Effect.logError('queue message does not decode', Cause.fail(error)),
          onSuccess: runHandlers,
        }),
        Effect.annotateLogs({ queueMessageId: record.messageId }),
        Effect.withSpan(`process ${definition.name}`, {
          kind: 'consumer',
          parent: Option.getOrUndefined(sender),
        }),
      )
    }

    return (event) =>
      Effect.forEach(event.Records, run, { concurrency: 'unbounded', discard: true }).pipe(
        Effect.as({ batchItemFailures: [] }),
      )
  }
}
