import * as AWS from '@alchemy.run/aws'
import * as SQL from '@alchemy.run/sql/Postgres'
import { NodeHttpClient } from '@effect/platform-node'
import { Array as Arr, Effect, Layer, pipe, Record } from 'effect'

import { ChatAssistant, ReplyChatService, TitleChatService } from '@app-template/application/chat'
import { MinimumLogLevelFromConfig } from '@app-template/kernel/config'
import { Db, PostgresRepositories } from '@app-template/kernel/data'
import { AnthropicClientFromConfig } from '@app-template/kernel/llm'
import type { SqsEvent } from '@app-template/packages/aws/queue'
import { Transaction } from '@app-template/packages/db'
import { consumeEvent } from '@app-template/worker/handler'

import { Database, databaseName } from '#deployment/Database'
import { Queues, workerTimeout } from '#deployment/Queues'

/** The worker as a function: one handler on the three queues, its services built once. */
export default class Worker extends AWS.Lambda.Function<Worker>()(
  'Worker',
  { main: import.meta.url, timeout: workerTimeout, memorySize: 1024 },
  Effect.gen(function* () {
    const connect = yield* AWS.RDS.Connect(yield* Database, { database: databaseName })
    const Postgres = SQL.PostgresLayer({ url: Effect.map(connect, ({ url }) => url) })

    const services = yield* Layer.mergeAll(ReplyChatService.layer, TitleChatService.layer).pipe(
      Layer.provide([PostgresRepositories, Transaction.layer]),
      Layer.provide(Db.layer),
      Layer.provide(Postgres),
      Layer.provide(ChatAssistant.layer),
      Layer.provide(AnthropicClientFromConfig),
      // Not `fetch`, which ends a model's answer silent for 300 s: `kernel/llm`'s client says why.
      // On undici's global dispatcher: this construction also runs where the stack is deployed,
      // under Bun, whose dispatcher of its own cannot be closed.
      Layer.provide([NodeHttpClient.layerUndiciNoDispatcher, MinimumLogLevelFromConfig]),
      Layer.provide(NodeHttpClient.dispatcherLayerGlobal),
      Layer.build,
    )

    const queues = yield* Queues
    const ownNames = yield* pipe(
      queues,
      Record.map((queue) => queue.queueName.asEffect()),
      Effect.all,
    )
    // Alchemy names the queues, and a listener is handed every queue's batch: the handler finds
    // the batch's route by the queue's own name.
    const consume = Effect.fnUntraced(function* (event: SqsEvent) {
      const routes = Record.fromEntries(
        Record.collect(yield* Effect.all(ownNames), (name, ownName) => [ownName, name] as const),
      )
      const { batchItemFailures } = yield* consumeEvent(routes)(event)
      return { batchItemFailures: Arr.copy(batchItemFailures) }
    })

    yield* pipe(
      Record.values(queues),
      Effect.forEach((queue) =>
        AWS.SQS.consumeQueueMessages(queue, { batchSize: 10 }, (event) =>
          consume(event).pipe(Effect.provide(services)),
        ),
      ),
    )
    return {}
  }).pipe(Effect.provide([AWS.RDS.ConnectHttp, AWS.Lambda.QueueEventSource])),
) {}
