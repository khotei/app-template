import { Cause, Effect } from 'effect'

import { ReplyChatService, type ReplyToMessage } from '@app-template/application/chat'

const logSkipped = () => Effect.logInfo('reply skipped: its Run is done, failed or gone')

const logFailed = (cause: Cause.Cause<unknown>) => Effect.logWarning('reply failed', cause)

/**
 * Replies to the job's user message and ends the job on any outcome but a bug, logging each end
 * but a defect, which the queue's consumer logs.
 */
export const replyToMessage = Effect.fn('replyToMessage')(
  (job: ReplyToMessage) =>
    ReplyChatService.use((replyChat) => replyChat.replyMessage(job.messageId)).pipe(
      Effect.catchTag('ActiveRunNotFoundError', logSkipped),
      // The Run holds these failures now, so the job ends.
      Effect.catchTag(['RunStartedError', 'LlmError'], (error) => logFailed(Cause.fail(error))),
      // An interrupt skips every catch and tap, the consumer's log too; this handler still runs.
      Effect.onErrorIf(Cause.hasInterrupts, (cause) => logFailed(cause)),
    ),
  (reply, job) => Effect.annotateLogs(reply, { messageId: job.messageId }),
)
