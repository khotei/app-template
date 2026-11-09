import { Array as Arr, Effect, Exit, Option, Schema } from 'effect'

const SqsRecord = Schema.Struct({
  messageId: Schema.String,
  body: Schema.String,
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

/**
 * Runs `handle` on each record's body and the `jobs` row it carries, and answers the failed
 * records: SQS delivers them again until the queue's `maxReceiveCount` dead-letters them.
 */
export function consumeBatch<E, R>(
  handle: (body: string, jobId: string) => Effect.Effect<unknown, E, R>,
): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R> {
  function run(record: SqsRecord) {
    const jobId = record.messageAttributes.jobId.stringValue
    return handle(record.body, jobId).pipe(
      Effect.tapCause((cause) => Effect.logError('queue message failed', cause)),
      Effect.annotateLogs({ jobId }),
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
