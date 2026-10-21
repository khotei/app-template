import { assert, describe, layer } from '@effect/vitest'
import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Effect, Layer, Option, Predicate } from 'effect'

import { buildStage, MiniStack } from '@app-template/testing'

import { buildResourceName } from '#aws/naming'
import { provision } from '#aws/provision'
import { type QueueResource, resources, unboundTag } from '#aws/resources'

const AwsClientsMiniStack = Layer.unwrap(
  Effect.map(MiniStack, ({ endpoint, region, credentials }) =>
    Layer.mergeAll(
      S3Service.layer({ endpoint: endpoint.href, region, credentials, forcePathStyle: true }),
      SQSService.layer({ endpoint: endpoint.href, region, credentials }),
    ),
  ),
).pipe(Layer.provide(MiniStack.layer))

const stage = buildStage()
const bucket = resources.buckets.attachments
const queues = Object.values(resources.queues)

const readLifecycleRules = Effect.fnUntraced(function* (stage: string) {
  const s3 = yield* S3Service
  const { Rules } = yield* s3.getBucketLifecycleConfiguration({
    Bucket: buildResourceName(stage, bucket.name),
  })
  return Rules ?? []
})

type LifecycleRule = Effect.Success<ReturnType<typeof readLifecycleRules>>[number]

const isOnUnboundKey = (rule: LifecycleRule) => rule.Filter?.Tag?.Key === unboundTag.key
const isOnUnboundValue = (rule: LifecycleRule) => rule.Filter?.Tag?.Value === unboundTag.value
const isAbortingIncompleteUploads = (rule: LifecycleRule) =>
  rule.AbortIncompleteMultipartUpload !== undefined

const findRule = Effect.fnUntraced(function* (
  stage: string,
  holds: Predicate.Predicate<LifecycleRule>,
) {
  const rules = yield* readLifecycleRules(stage)
  return Arr.findFirst(rules, holds)
})

const readQueueAttributes = Effect.fnUntraced(function* (name: string) {
  const sqs = yield* SQSService
  const { QueueUrl } = yield* sqs.getQueueUrl({ QueueName: name })
  const { Attributes } = yield* sqs.getQueueAttributes({
    QueueUrl,
    AttributeNames: ['QueueArn', 'RedrivePolicy'],
  })
  return Attributes ?? {}
})

const readRedrive = Effect.fnUntraced(function* (stage: string, queue: QueueResource) {
  const name = buildResourceName(stage, queue.name)
  const main = yield* readQueueAttributes(name)
  const deadLetter = yield* readQueueAttributes(`${name}-dlq`)
  return { policy: JSON.parse(main.RedrivePolicy ?? '{}'), deadLetterArn: deadLetter.QueueArn }
})

const snapshot = Effect.fnUntraced(function* (stage: string) {
  const rules = yield* readLifecycleRules(stage)
  const redrives = yield* Effect.forEach(queues, (queue) => readRedrive(stage, queue))
  return { rules, redrives }
})

describe('provision', () => {
  layer(AwsClientsMiniStack, { timeout: '60 seconds' })((it) => {
    it.effect('creates the bucket with the expiration rule on the unbound tag', () =>
      Effect.gen(function* () {
        yield* provision(resources, stage)

        const rule = yield* findRule(stage, Predicate.and(isOnUnboundKey, isOnUnboundValue))

        assert(Option.isSome(rule), 'no rule filters on the unbound tag')
        assert.strictEqual(rule.value.Status, 'Enabled')
        assert.strictEqual(rule.value.Expiration?.Days, bucket.lifecycle.unboundExpirationDays)
      }),
    )

    it.effect('creates the bucket with the rule aborting incomplete multipart uploads', () =>
      Effect.gen(function* () {
        yield* provision(resources, stage)

        const rule = yield* findRule(stage, isAbortingIncompleteUploads)

        assert(Option.isSome(rule), 'no rule aborts incomplete multipart uploads')
        assert.strictEqual(rule.value.Status, 'Enabled')
        assert.strictEqual(
          rule.value.AbortIncompleteMultipartUpload?.DaysAfterInitiation,
          bucket.lifecycle.abortIncompleteUploadDays,
        )
      }),
    )

    it.effect.each(queues)(
      'creates queue $name redriving to its dead-letter queue after maxReceiveCount',
      (queue) =>
        Effect.gen(function* () {
          yield* provision(resources, stage)

          const { policy, deadLetterArn } = yield* readRedrive(stage, queue)

          assert.strictEqual(policy.maxReceiveCount, queue.maxReceiveCount)
          assert.strictEqual(policy.deadLetterTargetArn, deadLetterArn)
        }),
    )

    it.effect('a second provision succeeds and changes nothing', () =>
      Effect.gen(function* () {
        const fresh = buildStage()
        const first = yield* provision(resources, fresh)
        const before = yield* snapshot(fresh)

        const second = yield* provision(resources, fresh)
        const after = yield* snapshot(fresh)

        assert.deepStrictEqual(
          Arr.map(first, (resource) => resource.outcome),
          Arr.map(first, () => 'created'),
        )
        assert.deepStrictEqual(
          second,
          Arr.map(first, (resource) => ({ ...resource, outcome: 'unchanged' })),
        )
        assert.deepStrictEqual(after, before)
      }),
    )
  })
})
