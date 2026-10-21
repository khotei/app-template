import {
  type BucketAlreadyExistsError,
  type SdkError as S3SdkError,
  S3Service,
  type S3ServiceError,
} from '@effect-aws/client-s3'
import {
  type InvalidAddressError,
  type InvalidAttributeNameError,
  type InvalidAttributeValueError,
  type InvalidSecurityError,
  type QueueDeletedRecentlyError,
  type QueueDoesNotExistError,
  type QueueNameExistsError,
  type RequestThrottledError,
  SQSService,
  type SdkError as SqsSdkError,
  type UnsupportedOperationError,
} from '@effect-aws/client-sqs'
import { Array as Arr, type Cause, Effect, Option } from 'effect'

import { buildResourceName } from '#aws/naming'
import { type BucketResource, type QueueResource, type Resources, unboundTag } from '#aws/resources'

export interface ProvisionedResource {
  readonly name: string
  readonly outcome: 'created' | 'unchanged'
}

export type ProvisionError =
  | Cause.NoSuchElementError
  | Cause.TimeoutError
  | S3SdkError
  | SqsSdkError
  | BucketAlreadyExistsError
  | S3ServiceError
  | InvalidAddressError
  | InvalidAttributeNameError
  | InvalidAttributeValueError
  | InvalidSecurityError
  | QueueDeletedRecentlyError
  | QueueDoesNotExistError
  | QueueNameExistsError
  | RequestThrottledError
  | UnsupportedOperationError

const buildLifecycleConfiguration = (bucket: BucketResource) => ({
  Rules: [
    {
      ID: 'expire-unbound',
      Status: 'Enabled' as const,
      Filter: { Tag: { Key: unboundTag.key, Value: unboundTag.value } },
      Expiration: { Days: bucket.lifecycle.unboundExpirationDays },
    },
    {
      ID: 'abort-incomplete-uploads',
      Status: 'Enabled' as const,
      Filter: { Prefix: '' },
      AbortIncompleteMultipartUpload: {
        DaysAfterInitiation: bucket.lifecycle.abortIncompleteUploadDays,
      },
    },
  ],
})

/** The key order is fixed: CreateQueue compares a repeated RedrivePolicy as a string. */
const buildRedrivePolicy = (deadLetterTargetArn: string, maxReceiveCount: number): string =>
  JSON.stringify({ deadLetterTargetArn, maxReceiveCount })

/**
 * Existence is read before the create, and both of its answers are accepted: a repeated
 * CreateBucket answers by region (`us-east-1`: success; elsewhere: BucketAlreadyOwnedByYou).
 */
const provisionBucket = Effect.fnUntraced(function* (stage: string, bucket: BucketResource) {
  const s3 = yield* S3Service
  const name = buildResourceName(stage, bucket.name)

  const exists = yield* s3.headBucket({ Bucket: name }).pipe(
    Effect.as(true),
    Effect.catchTag('NotFound', () => Effect.succeed(false)),
  )

  if (!exists) {
    yield* s3
      .createBucket({ Bucket: name })
      .pipe(Effect.catchTag('BucketAlreadyOwnedByYou', () => Effect.void))
  }
  yield* s3.putBucketLifecycleConfiguration({
    Bucket: name,
    LifecycleConfiguration: buildLifecycleConfiguration(bucket),
  })

  return { name, outcome: exists ? 'unchanged' : 'created' } satisfies ProvisionedResource
})

const provisionQueue = Effect.fnUntraced(function* (
  name: string,
  attributes: Record<string, string>,
) {
  const sqs = yield* SQSService

  const existing = yield* sqs.getQueueUrl({ QueueName: name }).pipe(
    Effect.map(Option.some),
    Effect.catchTag('QueueDoesNotExist', () => Effect.succeed(Option.none())),
  )
  const { QueueUrl } = yield* sqs.createQueue({ QueueName: name, Attributes: attributes })

  return {
    url: QueueUrl,
    resource: {
      name,
      outcome: Option.isSome(existing) ? 'unchanged' : 'created',
    } satisfies ProvisionedResource,
  }
})

const provisionQueuePair = Effect.fnUntraced(function* (stage: string, queue: QueueResource) {
  const sqs = yield* SQSService
  const name = buildResourceName(stage, queue.name)

  const deadLetter = yield* provisionQueue(`${name}-dlq`, {})
  const { Attributes } = yield* sqs.getQueueAttributes({
    QueueUrl: deadLetter.url,
    AttributeNames: ['QueueArn'],
  })
  const deadLetterArn = yield* Effect.fromNullishOr(Attributes?.QueueArn)
  const main = yield* provisionQueue(name, {
    RedrivePolicy: buildRedrivePolicy(deadLetterArn, queue.maxReceiveCount),
  })

  return [deadLetter.resource, main.resource]
})

/**
 * Creates every resource of the inventory under `stage` and reports each as created or
 * unchanged; a second run on the same inventory changes nothing.
 *
 * A queue whose attributes drifted from the inventory fails with `QueueNameExists`: SQS never
 * updates on create, and `make reset` is the local way back.
 */
export const provision = Effect.fn('provision')(function* (
  inventory: Resources,
  stage: string,
): Effect.fn.Return<ReadonlyArray<ProvisionedResource>, ProvisionError, S3Service | SQSService> {
  const buckets = yield* Effect.forEach(Object.values(inventory.buckets), (bucket) =>
    provisionBucket(stage, bucket),
  )
  const queues = yield* Effect.forEach(Object.values(inventory.queues), (queue) =>
    provisionQueuePair(stage, queue),
  )

  return Arr.appendAll(buckets, Arr.flatten(queues))
})
