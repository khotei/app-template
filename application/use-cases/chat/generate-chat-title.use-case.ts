import { Cause, Effect } from 'effect'

import { type GenerateChatTitle, ReplyChatService } from '@app-template/application/chat'

/**
 * Titles the chat its first message opened; a chat gone or titled meanwhile, or an assistant
 * error, is logged and skipped.
 */
export const generateChatTitle = Effect.fn('generateChatTitle')(
  (job: GenerateChatTitle) =>
    ReplyChatService.use((replyChat) => replyChat.replyTitle(job.messageId)),
  Effect.catchTags({
    // The cascade takes the first message with its chat, so a missing one means a deleted chat.
    MessageNotFoundError: () => Effect.logInfo('chat title skipped: chat deleted'),
    LlmError: (error) =>
      Effect.logWarning('chat title skipped: the assistant failed', Cause.fail(error)),
    ChatNotFoundError: () => Effect.logInfo('chat title skipped: chat deleted or titled'),
  }),
  (title, job) => Effect.annotateLogs(title, { messageId: job.messageId }),
)
