import * as AWS from '@alchemy.run/aws'
import { Duration, Effect } from 'effect'

import { type QueueName, resources } from '@app-template/kernel/aws'

export const workerTimeout = Duration.seconds(resources.worker.timeoutSeconds)

/**
 * Past the worker's timeout, so a message a handling still holds is not handed out again; AWS
 * refuses a mapping whose queue hides a message for less than its function may run.
 */
const visibilityTimeout = Duration.sum(workerTimeout, Duration.seconds(30))

const declare = Effect.fnUntraced(function* (
  id: string,
  { maxReceiveCount }: { readonly maxReceiveCount: number },
) {
  const deadLetter = yield* AWS.SQS.Queue(`${id}DeadLetter`)
  return yield* AWS.SQS.Queue(id, {
    visibilityTimeout,
    redrivePolicy: { deadLetterTargetArn: deadLetter.queueArn, maxReceiveCount },
  })
})

/** The app's queues, each with its dead-letter queue, by the name its definition has. */
export const Queues = Effect.all({
  'user-message-created': declare('UserMessageCreated', resources.queues.userMessageCreated),
  'chat-initialized': declare('ChatInitialized', resources.queues.chatInitialized),
  'message-retried': declare('MessageRetried', resources.queues.messageRetried),
} satisfies Record<QueueName, unknown>)
