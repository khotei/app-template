import * as AWS from '@alchemy.run/aws'
import { Duration, Effect } from 'effect'

import { type QueueName, resources } from '@app-template/kernel/aws'

export const workerTimeout = Duration.seconds(resources.worker.timeoutSeconds)

const declare = Effect.fnUntraced(function* (
  id: string,
  queue: { readonly maxReceiveCount: number; readonly visibilityTimeoutSeconds: number },
) {
  const deadLetter = yield* AWS.SQS.Queue(`${id}DeadLetter`)
  return yield* AWS.SQS.Queue(id, {
    visibilityTimeout: Duration.seconds(queue.visibilityTimeoutSeconds),
    redrivePolicy: {
      deadLetterTargetArn: deadLetter.queueArn,
      maxReceiveCount: queue.maxReceiveCount,
    },
  })
})

/** The app's queues, each with its dead-letter queue, by the name its definition has. */
export const Queues = Effect.all({
  'user-message-created': declare('UserMessageCreated', resources.queues.userMessageCreated),
  'chat-initialized': declare('ChatInitialized', resources.queues.chatInitialized),
  'message-retried': declare('MessageRetried', resources.queues.messageRetried),
} satisfies Record<QueueName, unknown>)
