import { Array as Arr, Effect, Option, pipe, Record } from 'effect'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'

import { assistantMessageQueue, chatTitleQueue } from '@app-template/application/chat'
import {
  GenerateAssistantMessageUseCase,
  GenerateChatTitleUseCase,
} from '@app-template/application/use-cases'
import { buildResourceName, type resources } from '@app-template/kernel/aws'
import { awsConfig } from '@app-template/kernel/config'
import { buildQueueName, consumeQueue, SqsEvent } from '@app-template/packages/queue'

type QueueName = (typeof resources.queues)[keyof typeof resources.queues]['name']

/**
 * `POST /events`: the batch an SQS mapping invokes the worker with, run by the use case of the
 * queue it came from; a batch of a queue with none is a defect.
 */
export const WorkerHandler = HttpRouter.use(
  Effect.fn(function* (router) {
    const { stage } = yield* awsConfig
    const assistantMessage = yield* GenerateAssistantMessageUseCase
    const chatTitle = yield* GenerateChatTitleUseCase

    const routes = {
      [assistantMessageQueue.name]: consumeQueue(assistantMessageQueue, assistantMessage.generate),
      [chatTitleQueue.name]: consumeQueue(chatTitleQueue, chatTitle.generate),
    } satisfies Record<QueueName, (event: SqsEvent) => Effect.Effect<unknown>>
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
