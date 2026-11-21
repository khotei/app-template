import { Cause, Effect } from 'effect'

import { ReplyChatService, type TitleChat } from '@app-template/application/chat'

/**
 * Titles the job's chat; a chat gone or titled meanwhile, or an assistant error, is logged and
 * skipped.
 */
export const titleChat = Effect.fn('titleChat')(
  (job: TitleChat) => ReplyChatService.use((replyChat) => replyChat.replyTitle(job.chatId)),
  Effect.catchTags({
    LlmError: (error) =>
      Effect.logWarning('title skipped: the assistant failed', Cause.fail(error)),
    ChatNotFoundError: () => Effect.logInfo('title skipped: chat deleted or titled'),
  }),
  (title, job) => Effect.annotateLogs(title, { chatId: job.chatId }),
)
