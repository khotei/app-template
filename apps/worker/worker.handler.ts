import { Array as Arr, Effect, Option, pipe, Record } from 'effect'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'

import { buildResourceName, type QueueName } from '@app-template/kernel/aws'
import { awsConfig } from '@app-template/kernel/config'
import { buildQueueName, SqsEvent } from '@app-template/packages/aws/queue'

import { ChatHandler } from '#worker/chat/chat.handler'

type JobServices = Effect.Services<ReturnType<(typeof ChatHandler)[keyof typeof ChatHandler]>>

const routes = { ...ChatHandler } satisfies Record<
  QueueName,
  (event: SqsEvent) => Effect.Effect<unknown, never, JobServices>
>

/**
 * `POST /events`: the batch an SQS mapping invokes the worker with, run by the handler of the
 * queue it came from; a batch of a queue with none is a defect.
 */
export const WorkerHandler = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
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
