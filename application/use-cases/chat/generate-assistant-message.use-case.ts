import { Effect } from 'effect'

import { type GenerateAssistantMessage, JobRunService } from '@app-template/application/chat'

/** Replies to the job's Run and ends the job on any outcome but a bug. */
export const generateAssistantMessage = Effect.fn('generateAssistantMessage')(
  (job: GenerateAssistantMessage) =>
    JobRunService.use((jobs) => jobs.reply(job.runId)).pipe(
      Effect.catchTags({
        // The Run holds the model's failure now, so the job ends.
        LlmRefusedError: () => Effect.void,
        LlmFailedError: () => Effect.void,
        // A refused move is a bug: a race dies on the write's guard instead.
        RunStatusInvalidError: Effect.die,
      }),
    ),
  (generate, job) => Effect.annotateLogs(generate, { runId: job.runId }),
)
