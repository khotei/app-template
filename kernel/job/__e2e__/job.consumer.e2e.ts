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

function buildEvent(receiveCount: number, rawBody = JSON.stringify(body)) {
  return {
    Records: [
      {
        messageId: 'a',
        receiptHandle: 'handle-a',
        body: rawBody,
        attributes: { ApproximateReceiveCount: receiveCount },
        messageAttributes: { jobId: { stringValue: jobId } },
        eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:stage-assistant-message',
      },
    ],
  }
}

const { maxAttempts } = sampleJobQueue

describe('JobConsumer.consume', () => {
  it.effect.each<{
    readonly name: string
    readonly status: 'queued' | 'done'
    readonly receiveCount: number
    readonly outcome: Effect.Effect<void, string>
    readonly runs: number
    readonly settled: 'queued' | 'done' | 'failed'
  }>([
    {
      name: 'a handled job',
      status: 'queued',
      receiveCount: 1,
      outcome: Effect.void,
      runs: 1,
      settled: 'done',
    },
    {
      name: 'a failed early attempt',
      status: 'queued',
      receiveCount: 1,
      outcome: Effect.fail('boom'),
      runs: 1,
      settled: 'queued',
    },
    {
      name: 'a failed last attempt',
      status: 'queued',
      receiveCount: maxAttempts,
      outcome: Effect.fail('boom'),
      runs: 1,
      settled: 'failed',
    },
    {
      name: 'a redelivered done job',
      status: 'done',
      receiveCount: 2,
      outcome: Effect.void,
      runs: 0,
      settled: 'done',
    },
  ])(
    '$name leaves the job $settled after $runs runs',
    ({ status, receiveCount, outcome, runs, settled }) =>
      Effect.gen(function* () {
        const consumer = yield* JobConsumer
        const jobs = yield* JobRepository
        const ran = yield* Ref.make(0)
        yield* jobs.insert({
          id: jobId,
          queue: sampleJobQueue.name,
          body,
          status,
          createdAt: new Date(0),
        })

        yield* consumer.consume(sampleJobQueue, () =>
          Ref.update(ran, (n) => n + 1).pipe(Effect.andThen(outcome)),
        )(buildEvent(receiveCount))
        const stored = yield* jobs.selectOne({ id: [jobId] })

        assert.strictEqual(yield* Ref.get(ran), runs)
        assert.deepStrictEqual(Option.map(stored, Struct.get('status')), Option.some(settled))
      }).pipe(Effect.provide(JobConsumerTest)),
  )

  it.effect('a queued job reads running while its handler runs', () =>
    Effect.gen(function* () {
      const consumer = yield* JobConsumer
      const jobs = yield* JobRepository
      yield* jobs.insert({
        id: jobId,
        queue: sampleJobQueue.name,
        body,
        status: 'queued',
        createdAt: new Date(0),
      })

      const seen = yield* Ref.make(Option.none<string>())
      yield* consumer.consume(sampleJobQueue, () =>
        jobs
          .selectOne({ id: [jobId] })
          .pipe(Effect.flatMap((job) => Ref.set(seen, Option.map(job, Struct.get('status'))))),
      )(buildEvent(1))

      assert.deepStrictEqual(yield* Ref.get(seen), Option.some('running'))
    }).pipe(Effect.provide(JobConsumerTest)),
  )

  it.effect('a job whose body does not decode fails at once, unrun and unretried', () =>
    Effect.gen(function* () {
      const consumer = yield* JobConsumer
      const jobs = yield* JobRepository
      yield* jobs.insert({
        id: jobId,
        queue: sampleJobQueue.name,
        body,
        status: 'queued',
        createdAt: new Date(0),
      })

      const response = yield* consumer.consume(sampleJobQueue, () => Effect.die('handler ran'))(
        buildEvent(1, '{"chatId":1}'),
      )
      const stored = yield* jobs.selectOne({ id: [jobId] })

      assert.deepStrictEqual(response, { batchItemFailures: [] })
      assert.deepStrictEqual(Option.map(stored, Struct.get('status')), Option.some('failed'))
    }).pipe(Effect.provide(JobConsumerTest)),
  )
})
