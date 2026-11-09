import type { Resources } from '@app-template/packages/aws'

const workerTimeoutSeconds = 60

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
