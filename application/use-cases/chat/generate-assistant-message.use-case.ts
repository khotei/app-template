import { Cause, Effect } from 'effect'

import {
  type GenerateAssistantMessage,
  JobRunService,
  MoveRunService,
  type RunId,
} from '@app-template/application/chat'

const logSkipped = () => Effect.logInfo('assistant reply skipped: its Run is settled or gone')

const logFailed = (cause: Cause.Cause<unknown>) =>
  Effect.logWarning('assistant reply failed', cause)

const workerStopped = Cause.die('the worker that started the Run stopped before it ended')

/** Fails a Run a dead worker left started, warning once the write lands. */
const failStopped = (id: RunId) =>
  MoveRunService.use((moves) => moves.fail(id, workerStopped)).pipe(
    Effect.andThen(logFailed(workerStopped)),
  )

/**
 * Replies to the job's Run and ends the job on any outcome but a bug, logging each end but a
 * defect, which the queue's consumer logs.
 */
export const generateAssistantMessage = Effect.fn('generateAssistantMessage')(
  (job: GenerateAssistantMessage) =>
    JobRunService.use((jobs) => jobs.reply(job.runId)).pipe(
      // Before the rows below, which also take this write's refusals: a Run settled meanwhile
      // is skipped, a refused move dies.
      Effect.catchTag('RunStartedError', ({ id }) => failStopped(id)),
      Effect.catchTags({
        RunNotFoundError: logSkipped,
        // The Run holds the model's failure now, so the job ends.
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
