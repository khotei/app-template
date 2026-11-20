import { Cause, Effect } from 'effect'

import { AskRunService, type GenerateAssistantMessage } from '@app-template/application/chat'

const logSkipped = () => Effect.logInfo('assistant reply skipped: its Run is settled or gone')

const logFailed = (cause: Cause.Cause<unknown>) =>
  Effect.logWarning('assistant reply failed', cause)

/**
 * Replies to the job's Run and ends the job on any outcome but a bug, logging each end but a
 * defect, which the queue's consumer logs.
 */
export const generateAssistantMessage = Effect.fn('generateAssistantMessage')(
  (job: GenerateAssistantMessage) =>
    AskRunService.use((askRun) => askRun.reply(job.runId)).pipe(
      Effect.catchTags({
        RunNotFoundError: logSkipped,
        // The Run holds these failures now, so the job ends.
        RunStartedError: (error) => logFailed(Cause.fail(error)),
        LlmRefusedError: (error) => logFailed(Cause.fail(error)),
        LlmFailedError: (error) => logFailed(Cause.fail(error)),
        // A refused move is a bug: a race dies on the write's guard instead.
        RunStatusInvalidError: Effect.die,
      }),
      // An interrupt skips every catch and tap, the consumer's log too; this handler still runs.
      Effect.onErrorIf(Cause.hasInterrupts, (cause) => logFailed(cause)),
    ),
  (generate, job) => Effect.annotateLogs(generate, { runId: job.runId }),
)
