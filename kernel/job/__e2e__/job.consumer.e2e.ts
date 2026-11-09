import { assert, describe, it } from '@effect/vitest'
import { SQSService } from '@effect-aws/client-sqs'
import { Effect, Layer, Option, Ref, Struct } from 'effect'

import { JobRepository } from '@app-template/kernel/data'
import { DbTest } from '@app-template/kernel/data/testing/e2e'

import { JobConsumer } from '#kernel/job/job.consumer'
import { sampleJobQueue, sampleProvenance } from '#testing/job/e2e/job.test-fixture'

// The consumer calls SQS only to delay a failed record's retry, which these tests leave out.
const JobConsumerTest = JobConsumer.layer.pipe(
  Layer.provide(
    Layer.mock(SQSService, {
      getQueueUrl: () => Effect.succeed({ QueueUrl: 'url', $metadata: {} }),
      changeMessageVisibility: () => Effect.succeed({ $metadata: {} }),
    }),
  ),
  Layer.provideMerge(JobRepository.layer),
  Layer.provideMerge(DbTest),
)

const jobId = '0192d4e0-7b3a-7c00-8000-000000000050'

const body = {
  chatId: '0192d4e0-7b3a-7c00-8000-000000000030',
  messageId: '0192d4e0-7b3a-7c00-8000-000000000040',
  provenance: sampleProvenance,
}

function buildEvent(rawBody = JSON.stringify(body)) {
  return {
    Records: [
      {
        messageId: 'a',
        receiptHandle: 'handle-a',
        body: rawBody,
        attributes: { ApproximateReceiveCount: 1 },
        messageAttributes: { jobId: { stringValue: jobId } },
        eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:stage-assistant-message',
      },
    ],
  }
}

const insertJob = (status: 'queued' | 'running' | 'done') =>
  JobRepository.use((jobs) =>
    jobs.insert({ id: jobId, queue: sampleJobQueue.name, body, status, createdAt: new Date(0) }),
  )

const selectStatus = JobRepository.use((jobs) => jobs.selectOne({ id: [jobId] })).pipe(
  Effect.map(Option.map(Struct.get('status'))),
)

describe('JobConsumer.consume', () => {
  it.effect.each<{
    readonly name: string
    readonly status: 'queued' | 'running' | 'done'
    readonly outcome: Effect.Effect<void, string>
    readonly runs: number
    readonly fails: number
    readonly settled: 'done' | 'failed'
  }>([
    {
      name: 'a handled job',
      status: 'queued',
      outcome: Effect.void,
      runs: 1,
      fails: 0,
      settled: 'done',
    },
    {
      name: 'a failed job',
      status: 'queued',
      outcome: Effect.fail('boom'),
      runs: 1,
      fails: 1,
      settled: 'failed',
    },
    {
      name: 'a job its process left running',
      status: 'running',
      outcome: Effect.void,
      runs: 0,
      fails: 1,
      settled: 'failed',
    },
    {
      name: 'a redelivered done job',
      status: 'done',
      outcome: Effect.void,
      runs: 0,
      fails: 0,
      settled: 'done',
    },
  ])(
    '$name runs $runs times, fails $fails times, ends $settled and is never retried',
    ({ status, outcome, runs, fails, settled }) =>
      Effect.gen(function* () {
        const consumer = yield* JobConsumer
        const ran = yield* Ref.make(0)
        const failed = yield* Ref.make(0)
        yield* insertJob(status)

        const response = yield* consumer.consume(sampleJobQueue, {
          handle: () => Ref.update(ran, (n) => n + 1).pipe(Effect.andThen(outcome)),
          fail: () => Ref.update(failed, (n) => n + 1),
        })(buildEvent())

        assert.deepStrictEqual(response, { batchItemFailures: [] })
        assert.strictEqual(yield* Ref.get(ran), runs)
        assert.strictEqual(yield* Ref.get(failed), fails)
        assert.deepStrictEqual(yield* selectStatus, Option.some(settled))
      }).pipe(Effect.provide(JobConsumerTest)),
  )

  it.effect('a queued job reads running while its handler runs', () =>
    Effect.gen(function* () {
      const consumer = yield* JobConsumer
      const seen = yield* Ref.make(Option.none<string>())
      yield* insertJob('queued')

      yield* consumer.consume(sampleJobQueue, {
        handle: () => selectStatus.pipe(Effect.flatMap((status) => Ref.set(seen, status))),
        fail: () => Effect.void,
      })(buildEvent())

      assert.deepStrictEqual(yield* Ref.get(seen), Option.some('running'))
    }).pipe(Effect.provide(JobConsumerTest)),
  )

  it.effect('a job whose body does not decode fails at once, unrun and unretried', () =>
    Effect.gen(function* () {
      const consumer = yield* JobConsumer
      yield* insertJob('queued')

      const response = yield* consumer.consume(sampleJobQueue, {
        handle: () => Effect.die('handler ran'),
        fail: () => Effect.die('fail ran'),
      })(buildEvent('{"chatId":1}'))

      assert.deepStrictEqual(response, { batchItemFailures: [] })
      assert.deepStrictEqual(yield* selectStatus, Option.some('failed'))
    }).pipe(Effect.provide(JobConsumerTest)),
  )
})
