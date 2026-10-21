export interface BucketResource {
  readonly name: string
  readonly lifecycle: {
    readonly unboundExpirationDays: number
    readonly abortIncompleteUploadDays: number
  }
}

/** A queue's dead-letter queue is `<name>-dlq`; `maxReceiveCount` equals its definition's `maxAttempts`. */
export interface QueueResource {
  readonly name: string
  readonly maxReceiveCount: number
}

export const resources = {
  buckets: {
    attachments: {
      name: 'attachments',
      lifecycle: { unboundExpirationDays: 1, abortIncompleteUploadDays: 1 },
    },
  },
  queues: {
    assistantMessage: { name: 'assistant-message', maxReceiveCount: 4 },
    chatTitle: { name: 'chat-title', maxReceiveCount: 5 },
  },
} as const satisfies {
  readonly buckets: Record<string, BucketResource>
  readonly queues: Record<string, QueueResource>
}
