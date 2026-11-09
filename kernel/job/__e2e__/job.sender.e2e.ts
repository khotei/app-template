import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { SQSService } from '@effect-aws/client-sqs'
import { Array as Arr, Effect, Exit, Layer } from 'effect'

import { buildResourceName } from '@app-template/kernel/aws'
import { AwsTest } from '@app-template/kernel/aws/testing/e2e'
import { AwsConfig } from '@app-template/kernel/config'
import { Db, JobRepository, jobs } from '@app-template/kernel/data'
import { DbTest } from '@app-template/kernel/data/testing/e2e'

import { JobSender } from '#kernel/job/job.sender'
import { SampleJob, sampleJobQueue, sampleProvenance } from '#testing/job/e2e/job.test-fixture'

const JobSenderTest = JobSender.layer.pipe(
  Layer.provideMerge(JobRepository.layer),
  Layer.provideMerge(DbTest),
  Layer.provideMerge(AwsTest),
  Layer.provide(BunCrypto.layer),
)

const job = new SampleJob({
  chatId: '0192d4e0-7b3a-7c00-8000-000000000030',
  messageId: '0192d4e0-7b3a-7c00-8000-000000000040',
  provenance: sampleProvenance,
})

const body = {
  chatId: '0192d4e0-7b3a-7c00-8000-000000000030',
  messageId: '0192d4e0-7b3a-7c00-8000-000000000040',
  provenance: { provider: 'anthropic', model: 'claude-sonnet-5-5', instructionsHash: 'a1b2c3' },
}

const send = JobSender.use((sender) => sender.send(sampleJobQueue, job).pipe(Effect.flatten))

const selectJobs = Db.use((db) =>
  db.select({ id: jobs.id, queue: jobs.queue, body: jobs.body, status: jobs.status }).from(jobs),
)

const queueUrl = Effect.gen(function* () {
  const { stage } = yield* AwsConfig
  const sqs = yield* SQSService

  const { QueueUrl } = yield* sqs.getQueueUrl({
    QueueName: buildResourceName(stage, sampleJobQueue.name),
  })
  return QueueUrl ?? ''
})

/** The messages on the sample queue within `waitSeconds`, as their job id and JSON body. */
const receive = (waitSeconds: number) =>
  Effect.gen(function* () {
    const sqs = yield* SQSService
    const url = yield* queueUrl

    const { Messages } = yield* sqs.receiveMessage({
      QueueUrl: url,
      MessageAttributeNames: ['All'],
      WaitTimeSeconds: waitSeconds,
    })
    return Arr.map(Messages ?? [], (message) => ({
      jobId: message.MessageAttributes?.jobId?.StringValue,
      body: JSON.parse(message.Body ?? ''),
    }))
  })

// Live: SQS long-polls in real time.
describe('JobSender', () => {
  it.live(
    "a sent job is queued and reaches the stage's queue under its row id",
    () =>
      Effect.gen(function* () {
        yield* send
        const rows = yield* selectJobs
        const received = yield* receive(10)

        assert.deepStrictEqual(
          Arr.map(rows, ({ id: _, ...row }) => row),
          [{ queue: 'assistant-message', body, status: 'queued' }],
        )
        assert.deepStrictEqual(received, [{ jobId: rows[0]?.id, body }])
      }).pipe(Effect.provide(JobSenderTest)),
    30_000,
  )

  it.live.fails('a send SQS refuses dies', () =>
    Effect.gen(function* () {
      const sqs = yield* SQSService
      const url = yield* queueUrl
      yield* sqs.deleteQueue({ QueueUrl: url })

      const exit = yield* Effect.exit(send)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(JobSenderTest)),
  )
})
