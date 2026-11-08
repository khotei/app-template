import { Array as Arr, Effect, Layer, Option, pipe, Record } from 'effect'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'

import { assistantMessageQueue, chatTitleQueue } from '@app-template/application/chat'
import { buildResourceName } from '@app-template/kernel/aws'
import { AwsConfig } from '@app-template/kernel/config'
import { JobConsumer } from '@app-template/kernel/job'
import { buildQueueName, SqsEvent } from '@app-template/packages/queue-2'

import { AssistantMessageHandler } from '#worker/chat/assistant-message.handler'
import { ChatTitleHandler } from '#worker/chat/chat-title.handler'

/**
 * `POST /events`: the batch an SQS mapping invokes the worker with, run by the handler of the
 * queue it came from; a batch of a queue with no handler is a defect.
 */
export const WorkerHandler = HttpRouter.use(
  Effect.fn(function* (router) {
    const consumer = yield* JobConsumer
    const { stage } = yield* AwsConfig
    const assistantMessage = yield* AssistantMessageHandler
    const chatTitle = yield* ChatTitleHandler

    const consumers = {
      [buildResourceName(stage, assistantMessageQueue.name)]: consumer.consume(
        assistantMessageQueue,
        assistantMessage.handle,
      ),
      [buildResourceName(stage, chatTitleQueue.name)]: consumer.consume(
        chatTitleQueue,
        chatTitle.handle,
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
).pipe(Layer.provide([JobConsumer.layer, AwsConfig.layer]))
