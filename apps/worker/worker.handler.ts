import { Array as Arr, Effect, Option, pipe, Record } from 'effect'

import type { QueueName } from '@app-template/kernel/aws'
import { QueueConsumer, type SqsEvent } from '@app-template/packages/aws/queue'

import { ChatHandler } from '#worker/chat/chat.handler'

type JobServices = Effect.Services<ReturnType<(typeof ChatHandler)[keyof typeof ChatHandler]>>

const routes = { ...ChatHandler } satisfies Record<
  QueueName,
  (event: SqsEvent) => Effect.Effect<unknown, never, JobServices>
>

/**
 * Runs the batch an SQS mapping invokes the worker with on the handler of the queue it came
 * from. `queues` names each queue's route by the queue's own name, the last part of its ARN; a
 * batch of a queue it does not hold is a defect.
 */
export const consumeEvent = (queues: Record<string, QueueName>) =>
  Effect.fnUntraced(function* (event: SqsEvent) {
    const consume = yield* pipe(
      Arr.head(event.Records),
      Option.flatMap((record) =>
        Record.get(queues, QueueConsumer.buildQueueName(record.eventSourceARN)),
      ),
      Option.map((name) => routes[name]),
      Effect.fromOption,
      Effect.orDie,
    )
    return yield* consume(event)
  })
