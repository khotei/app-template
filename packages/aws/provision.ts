import { LambdaService } from '@effect-aws/client-lambda'
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

import { buildDeadLetterName } from '#aws/naming'
import type { BucketResource, QueueResource, Resources } from '#aws/resources'

type BuildName = (name: string) => string

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
const provisionBucket = (buildName: BuildName) => (bucket: BucketResource) =>
  S3Service.use((s3) => s3.createBucket({ Bucket: buildName(bucket.name) })).pipe(
    Effect.catchTag('BucketAlreadyOwnedByYou', () => Effect.void),
  )

/** The key order is fixed: CreateQueue compares a repeated RedrivePolicy as a string. */
const buildRedrivePolicy = (deadLetterTargetArn: string, maxReceiveCount: number): string =>
  JSON.stringify({ deadLetterTargetArn, maxReceiveCount })

const provisionQueuePair = (buildName: BuildName) =>
  Effect.fnUntraced(function* (queue: QueueResource) {
    const sqs = yield* SQSService
    const name = buildName(queue.name)

    const deadLetter = yield* sqs.createQueue({ QueueName: buildDeadLetterName(name) })
    const { Attributes } = yield* sqs.getQueueAttributes({
      QueueUrl: deadLetter.QueueUrl,
      AttributeNames: ['QueueArn'],
    })
    const deadLetterArn = yield* Effect.fromNullishOr(Attributes?.QueueArn)
    yield* sqs.createQueue({
      QueueName: name,
      Attributes: {
        RedrivePolicy: buildRedrivePolicy(deadLetterArn, queue.maxReceiveCount),
        VisibilityTimeout: String(queue.visibilityTimeoutSeconds),
      },
    })
  })

/** Creates each bucket under `buildName(name)`, without lifecycle rules; reruns change nothing. */
const provisionBuckets = Effect.fn('provisionBuckets')(
  (
    buckets: Resources['buckets'],
    buildName: BuildName,
  ): Effect.Effect<void, ProvisionBucketError, S3Service> =>
    pipe(buckets, Rec.values, Effect.forEach(provisionBucket(buildName), { discard: true })),
)

/**
 * Creates each queue with its dead-letter queue under `buildName(name)`; a second run on the same
 * queues changes nothing.
 *
 * A queue whose attributes drifted from the inventory fails with `QueueNameExists`: SQS never
 * updates on create, and `make reset` is the local way back.
 */
const provisionQueues = Effect.fn('provisionQueues')(
  (
    queues: Resources['queues'],
    buildName: BuildName,
  ): Effect.Effect<void, ProvisionQueueError, SQSService> =>
    pipe(queues, Rec.values, Effect.forEach(provisionQueuePair(buildName), { discard: true })),
)

type ProvisionWorkerError =
  | ProvisionQueueError
  | Effect.Error<ReturnType<LambdaService['Service']['createFunction']>>
  | Effect.Error<ReturnType<LambdaService['Service']['createEventSourceMapping']>>

const mapQueue = (buildName: BuildName, functionName: string) =>
  Effect.fnUntraced(function* (queue: QueueResource) {
    const sqs = yield* SQSService
    const lambda = yield* LambdaService

    const { QueueUrl } = yield* sqs.getQueueUrl({ QueueName: buildName(queue.name) })
    const { Attributes } = yield* sqs.getQueueAttributes({ QueueUrl, AttributeNames: ['QueueArn'] })
    yield* lambda.createEventSourceMapping({
      EventSourceArn: yield* Effect.fromNullishOr(Attributes?.QueueArn),
      FunctionName: functionName,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    })
  })

/**
 * Creates the worker's function under `buildName(name)`, whose every invoke MiniStack hands to
 * `proxyUrl` instead of running its code, and one mapping per queue that invokes it; the queues
 * must exist.
 */
export const provisionWorker = Effect.fn('provisionWorker')(function* (
  { worker, queues }: Resources,
  { buildName, proxyUrl }: { readonly buildName: BuildName; readonly proxyUrl: string },
): Effect.fn.Return<void, ProvisionWorkerError, LambdaService | SQSService> {
  const lambda = yield* LambdaService
  const functionName = buildName(worker.name)

  yield* lambda.createFunction({
    FunctionName: functionName,
    Runtime: 'provided.al2023',
    Handler: 'bootstrap',
    // MiniStack takes any role, and an empty archive: behind its proxy the code never runs.
    Role: 'arn:aws:iam::000000000000:role/worker',
    Code: { ZipFile: new Uint8Array() },
    Timeout: worker.timeoutSeconds,
    Environment: { Variables: { MINISTACK_LAMBDA_PROXY_URL: proxyUrl } },
  })
  yield* pipe(
    queues,
    Rec.values,
    Effect.forEach(mapQueue(buildName, functionName), { discard: true }),
  )
})

/** The whole inventory under `buildName(name)`: the buckets and the queues. */
export const provision = Effect.fn('provision')(
  ({ buckets, queues }: Resources, buildName: BuildName) =>
    Effect.all([provisionBuckets(buckets, buildName), provisionQueues(queues, buildName)], {
      discard: true,
    }),
)
