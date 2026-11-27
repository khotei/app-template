import { LambdaService } from '@effect-aws/client-lambda'
import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { Effect, pipe, Record as Rec } from 'effect'

import type { Resources } from '@app-template/packages/aws'

import { ResourceName } from '#kernel/aws/resources/resources-naming'

type BucketResource = Resources['buckets'][string]
type QueueResource = Resources['queues'][string]

// A bucket this account holds already is the one asked for: CreateBucket never updates one.
const provisionBucket = (stage: string) =>
  Effect.fnUntraced(function* (bucket: BucketResource) {
    const s3 = yield* S3Service
    return yield* s3
      .createBucket({ Bucket: ResourceName.build(stage, bucket.name) })
      .pipe(Effect.catchTag('BucketAlreadyOwnedByYou', () => Effect.void))
  })

/** The key order is fixed: CreateQueue compares a repeated RedrivePolicy as a string. */
const buildRedrivePolicy = (deadLetterTargetArn: string, maxReceiveCount: number): string =>
  JSON.stringify({ deadLetterTargetArn, maxReceiveCount })

const provisionQueuePair = (stage: string) =>
  Effect.fnUntraced(function* (queue: QueueResource) {
    const sqs = yield* SQSService
    const name = ResourceName.build(stage, queue.name)

    const deadLetter = yield* sqs.createQueue({ QueueName: ResourceName.buildDeadLetter(name) })
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

/** Creates each bucket named for `stage`, without lifecycle rules; reruns change nothing. */
const provisionBuckets = Effect.fn('provisionBuckets')(
  (buckets: Resources['buckets'], stage: string) =>
    pipe(buckets, Rec.values, Effect.forEach(provisionBucket(stage), { discard: true })),
)

/**
 * Creates each queue with its dead-letter queue, named for `stage`; a second call on the same
 * queues changes nothing.
 *
 * A queue whose attributes drifted from the inventory fails with `QueueNameExists`: SQS never
 * updates on create, and `make reset` is the local way back.
 */
const provisionQueues = Effect.fn('provisionQueues')((queues: Resources['queues'], stage: string) =>
  pipe(queues, Rec.values, Effect.forEach(provisionQueuePair(stage), { discard: true })),
)

const mapQueue = (stage: string, functionName: string) =>
  Effect.fnUntraced(function* (queue: QueueResource) {
    const sqs = yield* SQSService
    const lambda = yield* LambdaService

    const { QueueUrl } = yield* sqs.getQueueUrl({
      QueueName: ResourceName.build(stage, queue.name),
    })
    const { Attributes } = yield* sqs.getQueueAttributes({ QueueUrl, AttributeNames: ['QueueArn'] })
    yield* lambda.createEventSourceMapping({
      EventSourceArn: yield* Effect.fromNullishOr(Attributes?.QueueArn),
      FunctionName: functionName,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    })
  })

/**
 * Creates the worker's function named for `stage`, whose every invoke MiniStack hands to
 * `proxyUrl` instead of running its code, and one mapping per queue that invokes it; the queues
 * must exist.
 */
export const provisionWorker = Effect.fn('provisionWorker')(function* (
  { worker, queues }: Resources,
  { stage, proxyUrl }: { readonly stage: string; readonly proxyUrl: string },
) {
  const lambda = yield* LambdaService
  const functionName = ResourceName.build(stage, worker.name)

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
  yield* pipe(queues, Rec.values, Effect.forEach(mapQueue(stage, functionName), { discard: true }))
})

/** The whole inventory named for `stage` by `ResourceName.build`: the buckets and the queues. */
export const provision = Effect.fn('provision')(({ buckets, queues }: Resources, stage: string) =>
  Effect.all([provisionBuckets(buckets, stage), provisionQueues(queues, stage)], {
    discard: true,
  }),
)
