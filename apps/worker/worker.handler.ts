import { Array as Arr, Effect, Option, pipe, Record } from 'effect'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'

import { ReplyToMessage, TitleChat } from '@app-template/application/chat'
import { replyToMessage, titleChat } from '@app-template/application/use-cases'
import { buildResourceName, type resources } from '@app-template/kernel/aws'
import { awsConfig } from '@app-template/kernel/config'
import { buildQueueName, consumeQueue, SqsEvent } from '@app-template/packages/queue'

type QueueName = (typeof resources.queues)[keyof typeof resources.queues]['name']

type JobServices = Effect.Services<ReturnType<typeof replyToMessage | typeof titleChat>>

const routes = {
  [ReplyToMessage.queue.name]: consumeQueue(ReplyToMessage.queue, replyToMessage),
  [TitleChat.queue.name]: consumeQueue(TitleChat.queue, titleChat),
} satisfies Record<QueueName, (event: SqsEvent) => Effect.Effect<unknown, never, JobServices>>

/**
 * `POST /events`: the batch an SQS mapping invokes the worker with, run by the use case of the
 * queue it came from; a batch of a queue with none is a defect.
 */
export const WorkerHandler = HttpRouter.use(
  Effect.fn(function* (router) {
    const { stage } = yield* awsConfig
    const consumers = Record.mapKeys(routes, (name) => buildResourceName(stage, name))

    yield* router.add(
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
  }),
)
