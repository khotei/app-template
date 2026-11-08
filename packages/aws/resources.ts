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
  /** How long a delivered message stays hidden: AWS refuses a mapping on less than its function's timeout. */
  readonly visibilityTimeoutSeconds: number
}

/** The function every queue invokes with its batches. */
export interface WorkerResource {
  readonly name: string
  readonly timeoutSeconds: number
}

export interface Resources {
  readonly buckets: Record<string, BucketResource>
  readonly queues: Record<string, QueueResource>
  readonly worker: WorkerResource
}
