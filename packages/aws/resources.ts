export interface BucketResource {
  readonly name: string
  readonly lifecycle: {
    readonly unboundExpirationDays: number
    readonly abortIncompleteUploadDays: number
  }
}

/** `maxReceiveCount` equals its definition's `maxAttempts`. */
export interface QueueResource {
  readonly name: string
  readonly maxReceiveCount: number
}

export interface Resources {
  readonly buckets: Record<string, BucketResource>
  readonly queues: Record<string, QueueResource>
}

/** The object tag the bucket's expiration rule selects on. */
export const unboundTag = { key: 'unbound', value: 'true' } as const

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
