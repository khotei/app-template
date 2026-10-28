import { type BucketAlreadyExistsError, S3Service } from '@effect-aws/client-s3'
import {
  type InvalidAddressError,
  type InvalidAttributeNameError,
  type InvalidAttributeValueError,
  type InvalidSecurityError,
  type QueueDeletedRecentlyError,
  type QueueDoesNotExistError,
  type QueueNameExistsError,
  type RequestThrottledError,
  type SdkError,
  SQSService,
  type UnsupportedOperationError,
} from '@effect-aws/client-sqs'
import { type Cause, Effect, pipe, Record as Rec } from 'effect'

import { buildDeadLetterName, buildResourceName } from '#aws/naming'
import type { BucketResource, QueueResource, Resources } from '#aws/resources'

type ProvisionBucketError = Cause.TimeoutError | SdkError | BucketAlreadyExistsError

type ProvisionQueueError =
  | Cause.NoSuchElementError
  | Cause.TimeoutError
  | SdkError
  | InvalidAddressError
  | InvalidAttributeNameError
  | InvalidAttributeValueError
  | InvalidSecurityError
  | QueueDeletedRecentlyError
  | QueueDoesNotExistError
  | QueueNameExistsError
  | RequestThrottledError
  | UnsupportedOperationError

// A bucket this account holds already is the one asked for: CreateBucket never updates one.
const provisionBucket = (stage: string) => (bucket: BucketResource) =>
  Effect.flatMap(S3Service, (s3) =>
    s3.createBucket({ Bucket: buildResourceName(stage, bucket.name) }),
  ).pipe(Effect.catchTag('BucketAlreadyOwnedByYou', () => Effect.void))

/** The key order is fixed: CreateQueue compares a repeated RedrivePolicy as a string. */
const buildRedrivePolicy = (deadLetterTargetArn: string, maxReceiveCount: number): string =>
  JSON.stringify({ deadLetterTargetArn, maxReceiveCount })

const provisionQueuePair = (stage: string) =>
  Effect.fnUntraced(function* (queue: QueueResource) {
    const sqs = yield* SQSService
    const name = buildResourceName(stage, queue.name)

    const deadLetter = yield* sqs.createQueue({ QueueName: buildDeadLetterName(name) })
    const { Attributes } = yield* sqs.getQueueAttributes({
      QueueUrl: deadLetter.QueueUrl,
      AttributeNames: ['QueueArn'],
    })
    const deadLetterArn = yield* Effect.fromNullishOr(Attributes?.QueueArn)
    yield* sqs.createQueue({
      QueueName: name,
      Attributes: { RedrivePolicy: buildRedrivePolicy(deadLetterArn, queue.maxReceiveCount) },
    })
  })

/** Creates each bucket under `stage`, without its lifecycle rules; a second run changes nothing. */
const provisionBuckets = Effect.fn('provisionBuckets')(
  (
    buckets: Resources['buckets'],
    stage: string,
  ): Effect.Effect<void, ProvisionBucketError, S3Service> =>
    pipe(buckets, Rec.values, Effect.forEach(provisionBucket(stage), { discard: true })),
)

/**
 * Creates each queue with its dead-letter queue under `stage`; a second run on the same queues
 * changes nothing.
 *
 * A queue whose attributes drifted from the inventory fails with `QueueNameExists`: SQS never
 * updates on create, and `make reset` is the local way back.
 */
export const provisionQueues = Effect.fn('provisionQueues')(
  (
    queues: Resources['queues'],
    stage: string,
  ): Effect.Effect<void, ProvisionQueueError, SQSService> =>
    pipe(queues, Rec.values, Effect.forEach(provisionQueuePair(stage), { discard: true })),
)

/** The whole inventory under `stage`: the buckets and the queues. */
export const provision = Effect.fn('provision')(({ buckets, queues }: Resources, stage: string) =>
  Effect.all([provisionBuckets(buckets, stage), provisionQueues(queues, stage)], {
    discard: true,
  }),
)
