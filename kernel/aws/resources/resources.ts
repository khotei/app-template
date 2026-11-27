import type { Resources } from '@app-template/packages/aws'

/**
 * Above the slowest reply with its summary: a handling past it is killed, and its redelivery
 * fails the reply.
 */
const workerTimeoutSeconds = 600

export const resources = {
  buckets: {
    attachments: {
      name: 'attachments',
      lifecycle: { abortIncompleteUploadDays: 1 },
    },
  },
  queues: {
    replyToMessage: {
      name: 'reply-to-message',
      maxReceiveCount: 3,
      visibilityTimeoutSeconds: workerTimeoutSeconds,
    },
    titleChat: {
      name: 'title-chat',
      maxReceiveCount: 3,
      visibilityTimeoutSeconds: workerTimeoutSeconds,
    },
  },
  worker: { name: 'worker', timeoutSeconds: workerTimeoutSeconds },
} as const satisfies Resources

/** The name of a queue of the inventory, which keys the worker's routes. */
export type QueueName = (typeof resources.queues)[keyof typeof resources.queues]['name']
