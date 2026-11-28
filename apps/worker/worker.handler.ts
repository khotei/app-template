import { Array as Arr, Effect, Option, pipe, Record } from 'effect'

import { type QueueName, ResourceName } from '@app-template/kernel/aws'
import {
  QueueConsumer,
  type SqsBatchResponse,
  type SqsEvent,
} from '@app-template/packages/aws/queue'

import { ChatHandler } from '#worker/chat/chat.handler'

type JobServices = Effect.Services<ReturnType<(typeof ChatHandler)[keyof typeof ChatHandler]>>

const routes = { ...ChatHandler } satisfies Record<
  QueueName,
  (event: SqsEvent) => Effect.Effect<unknown, never, JobServices>
>

/**
 * Runs the batch an SQS mapping invokes the worker with on the handler of the queue it came
 * from, among the queues of `stage`; a batch of a queue with none is a defect.
 */
export const consumeEvent = (stage: string) => {
  const consumers = Record.mapKeys(routes, (name) => ResourceName.build(stage, name))

  return Effect.fnUntraced(function* (event: SqsEvent) {
    const consume = yield* pipe(
      Arr.head(event.Records),
      Option.flatMap((record) =>
        Record.get(consumers, QueueConsumer.buildQueueName(record.eventSourceARN)),
      ),
      Effect.fromOption,
      Effect.orDie,
    )
    return yield* consume(event)
  })
}
