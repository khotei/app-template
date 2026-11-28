import * as AWS from '@alchemy.run/aws'
import * as Alchemy from 'alchemy'
import { Effect } from 'effect'

import { Database } from '#deployment/Database'
import { Files } from '#deployment/Files'
import { Queues } from '#deployment/Queues'

export default Alchemy.Stack(
  'AppTemplate',
  { providers: AWS.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const queues = yield* Queues
    const database = yield* Database
    const files = yield* Files

    return {
      userMessageCreatedQueue: queues['user-message-created'].queueUrl,
      chatInitializedQueue: queues['chat-initialized'].queueUrl,
      messageRetriedQueue: queues['message-retried'].queueUrl,
      databaseHost: database.endpointAddress,
      filesBucket: files.bucketName,
    }
  }),
)
