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
