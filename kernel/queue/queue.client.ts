import { DateTime, Effect, Layer, type Schema } from 'effect'

import { JobRepository } from '@app-template/kernel/data'
import { encodeJob, type QueueDefinition, QueueSender } from '@app-template/packages/queue'

/**
 * Writes each job to the `jobs` table, joining the caller's transaction, for `JobRelay` to send
 * to SQS.
 */
export const QueueSenderJobs: Layer.Layer<QueueSender, never, JobRepository> = Layer.effect(
  QueueSender,
  JobRepository.useSync((jobs) => {
    const send = Effect.fn('QueueSender.send')(function* <A, I>(
      definition: QueueDefinition<Schema.Codec<A, I>>,
      message: A,
    ) {
      const body = yield* encodeJob(definition, message)
      const now = yield* DateTime.nowAsDate

      yield* jobs.insert({
        queue: definition.name,
        jobId: definition.jobId(message),
        body,
        createdAt: now,
      })
    })

    return QueueSender.of({ send })
  }),
)
