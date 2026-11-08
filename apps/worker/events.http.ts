import { Array as Arr, Effect, Option, pipe, Record } from 'effect'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'

import { buildQueueName, type SqsBatchResponse, SqsEvent } from '@app-template/packages/queue-2'

/** Each queue's consumer, keyed by the queue's name on SQS. */
export type EventConsumers<R> = Record.ReadonlyRecord<
  string,
  (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R>
>

/**
 * `POST /events`: the batch an SQS mapping invokes the worker with, run by the consumer of the
 * queue it came from; a batch of a queue with no consumer is a defect.
 */
export function addEventsRoute<R>(consumers: EventConsumers<R>) {
  return HttpRouter.add(
    'POST',
    '/events',
    Effect.gen(function* () {
      const event = yield* HttpServerRequest.schemaBodyJson(SqsEvent)
      const consume = yield* pipe(
        Arr.head(event.Records),
        Option.flatMap((record) => Record.get(consumers, buildQueueName(record.eventSourceARN))),
        Effect.fromOption,
        Effect.orDie,
      )

      const response = yield* consume(event)
      return HttpServerResponse.jsonUnsafe(response)
    }),
  )
}
