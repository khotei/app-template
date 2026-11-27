import { type Array as Arr, Cause, Effect, Option, Schema } from 'effect'
import { Headers, HttpTraceContext } from 'effect/http'

import { buildMessageCodec, type QueueDefinition } from '#queue/queue-definition'

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

/**
 * Runs every handler on each record's message, decoded once by the definition's schema, all of a
 * record's concurrently, and acknowledges every record: SQS delivers one again only when the
 * process died under it, and then every handler runs again. A handler has no error channel, so
 * it ends its work's failure itself; one that dies is logged and leaves the others running, while
 * an interrupt ends them all and returns no response. A body
 * that does not decode never will, so it is logged and acknowledged, unrun. Each record runs in a
 * span under the one that sent it, else under the current span.
 */
export function consumeQueue<
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
export function consumeQueue<A, I, R>(
  definition: QueueDefinition<Schema.Codec<A, I>>,
  handlers: Arr.NonEmptyReadonlyArray<(message: A) => Effect.Effect<unknown, never, R>>,
): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
  const decode = Schema.decodeEffect(buildMessageCodec(definition))

  const handleEach = (message: A) =>
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
        onSuccess: handleEach,
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
