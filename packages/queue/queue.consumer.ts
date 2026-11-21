import { Array as Arr, Cause, Effect, Exit, Option, Schema } from 'effect'
import { Headers, HttpTraceContext } from 'effect/http'

import { buildMessageCodec, type QueueDefinition } from '#queue/queue.model'

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
 * Runs `handle` on each record's message, decoded by the definition's schema, and returns the
 * records whose handler died: SQS delivers them again until the queue's `maxReceiveCount`
 * dead-letters them. A handler has no error channel, so it settles its work's failure itself.
 * A body that does not decode never will, so it is logged and acknowledged, unrun. Each
 * record runs in a span under the one that sent it, else under the current span.
 */
export function consumeQueue<A, I, R>(
  definition: QueueDefinition<Schema.Codec<A, I>>,
  handle: (message: A) => Effect.Effect<unknown, never, R>,
): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
  const decode = Schema.decodeEffect(buildMessageCodec(definition))

  function run(record: SqsRecord) {
    const sender = Option.fromUndefinedOr(record.messageAttributes.traceparent).pipe(
      Option.flatMap(({ stringValue }) =>
        HttpTraceContext.w3c(Headers.fromInput({ traceparent: stringValue })),
      ),
    )
    return decode(record.body).pipe(
      Effect.matchEffect({
        onFailure: (error) => Effect.logError('queue message does not decode', Cause.fail(error)),
        onSuccess: handle,
      }),
      Effect.tapCause((cause) => Effect.logError('queue message failed', cause)),
      Effect.annotateLogs({ messageId: record.messageId }),
      Effect.withSpan(`process ${definition.name}`, {
        kind: 'consumer',
        parent: Option.getOrUndefined(sender),
      }),
      Effect.exit,
      Effect.map((exit) =>
        Exit.isSuccess(exit) ? Option.none() : Option.some({ itemIdentifier: record.messageId }),
      ),
    )
  }

  return (event) =>
    Effect.forEach(event.Records, run, { concurrency: 'unbounded' }).pipe(
      Effect.map((failures) => ({ batchItemFailures: Arr.getSomes(failures) })),
    )
}
