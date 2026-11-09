import { Array as Arr, Effect, Layer, Option, pipe, Record } from 'effect'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'

import { assistantMessageQueue, chatTitleQueue } from '@app-template/application/chat'
import {
  GenerateAssistantMessageUseCase,
  GenerateChatTitleUseCase,
} from '@app-template/application/use-cases'
import { buildResourceName } from '@app-template/kernel/aws'
import { AwsConfig } from '@app-template/kernel/config'
import { buildQueueName, QueueConsumer, SqsEvent } from '@app-template/packages/queue'

/**
 * `POST /events`: the batch an SQS mapping invokes the worker with, run by the use case of the
 * queue it came from; a batch of a queue with none is a defect.
 */
export const WorkerHandler = HttpRouter.use(
  Effect.fn(function* (router) {
    const consumer = yield* QueueConsumer
    const { stage } = yield* AwsConfig
    const assistantMessage = yield* GenerateAssistantMessageUseCase
    const chatTitle = yield* GenerateChatTitleUseCase

    const consumers = {
      [buildResourceName(stage, assistantMessageQueue.name)]: consumer.consume(
        assistantMessageQueue,
        assistantMessage.generate,
      ),
      [buildResourceName(stage, chatTitleQueue.name)]: consumer.consume(
        chatTitleQueue,
        chatTitle.generate,
      ),
    }

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
).pipe(Layer.provide([QueueConsumer.layer, AwsConfig.layer]))
