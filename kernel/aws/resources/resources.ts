import type { Resources } from '@app-template/packages/aws'

export const resources = {
  buckets: {
    attachments: {
      name: 'attachments',
      lifecycle: { unboundExpirationDays: 1, abortIncompleteUploadDays: 1 },
    },
  },
  queues: {
    assistantMessage: { name: 'assistant-message', maxReceiveCount: 3 },
    chatTitle: { name: 'chat-title', maxReceiveCount: 5 },
  },
} as const satisfies Resources
