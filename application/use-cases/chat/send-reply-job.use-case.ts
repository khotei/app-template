import { Cause, Effect } from 'effect'

import {
  MoveRunService,
  type Run,
  sendGenerateAssistantMessage,
} from '@app-template/application/chat'

/** Sends the Run's job and answers the Run, failed with SQS's error when SQS refuses the job. */
export const sendReplyJob = Effect.fn('sendReplyJob')((run: Run) =>
  sendGenerateAssistantMessage(run).pipe(
    Effect.as(run),
    Effect.catch((error) => MoveRunService.use((moves) => moves.fail(run.id, Cause.fail(error)))),
    // The Run was stored queued a moment before, so a Run gone or a refused move is a defect.
    Effect.orDie,
    // A client's abort mid-send still leaves the Run sent or failed.
    Effect.uninterruptible,
  ),
)
