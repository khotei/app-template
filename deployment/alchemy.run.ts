import * as AWS from '@alchemy.run/aws'
import * as Alchemy from 'alchemy'
import { Effect } from 'effect'

import Api from '#deployment/Api'
import { Database } from '#deployment/Database'
import { Files } from '#deployment/Files'
import { Queues } from '#deployment/Queues'
import Worker from '#deployment/Worker'

export default Alchemy.Stack(
  'AppTemplate',
  { providers: AWS.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const queues = yield* Queues
    const database = yield* Database
    const files = yield* Files
    const api = yield* Api
    const worker = yield* Worker

    return {
      apiUrl: api.functionUrl,
      worker: worker.functionName,
      userMessageCreatedQueue: queues['user-message-created'].queueUrl,
      chatInitializedQueue: queues['chat-initialized'].queueUrl,
      messageRetriedQueue: queues['message-retried'].queueUrl,
      databaseHost: database.endpointAddress,
      filesBucket: files.bucketName,
    }
  }),
)
