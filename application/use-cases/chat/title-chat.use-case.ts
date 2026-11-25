import { Cause, Effect } from 'effect'

import { type TitleChat, TitleChatService } from '@app-template/application/chat'

/**
 * Titles the job's chat; a chat gone or titled meanwhile, or an assistant error, is logged and
 * skipped.
 */
export const titleChat = Effect.fn('titleChat')(
  function* (job: TitleChat) {
    const titles = yield* TitleChatService
    return yield* titles.title(job.chatId)
  },
  Effect.catchTags({
    LlmError: (error) =>
      Effect.logWarning('title skipped: the assistant failed', Cause.fail(error)),
    ChatNotFoundError: () => Effect.logInfo('title skipped: chat deleted or titled'),
  }),
  (title, job) => Effect.annotateLogs(title, { chatId: job.chatId }),
)
