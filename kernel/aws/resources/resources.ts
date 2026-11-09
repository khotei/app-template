import type { Resources } from '@app-template/packages/aws'

/** Above the slowest reply: a run past it is killed, and its redelivery fails the reply. */
const workerTimeoutSeconds = 600

export const resources = {
  buckets: {
    attachments: {
      name: 'attachments',
      lifecycle: { unboundExpirationDays: 1, abortIncompleteUploadDays: 1 },
    },
  },
  queues: {
    assistantMessage: {
      name: 'assistant-message',
      maxReceiveCount: 3,
      visibilityTimeoutSeconds: workerTimeoutSeconds,
    },
    chatTitle: {
      name: 'chat-title',
      maxReceiveCount: 3,
      visibilityTimeoutSeconds: workerTimeoutSeconds,
    },
  },
  worker: { name: 'worker', timeoutSeconds: workerTimeoutSeconds },
} as const satisfies Resources
