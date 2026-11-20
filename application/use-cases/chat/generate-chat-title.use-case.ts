import { Cause, Effect, Option } from 'effect'

import {
  ChatAssistant,
  ChatService,
  type GenerateChatTitle,
  isBlank,
  MessageService,
} from '@app-template/application/chat'
import type { LlmError } from '@app-template/kernel/llm/error'

const logAssistantFailure = (error: LlmError) =>
  Effect.logWarning('chat title skipped: the assistant failed', Cause.fail(error))

/**
 * Titles the chat its first message opened; a chat gone or titled meanwhile, or an assistant
 * error, is logged and skipped.
 */
export const generateChatTitle = Effect.fn('generateChatTitle')(
  function* (job: GenerateChatTitle) {
    const assistant = yield* ChatAssistant
    const chats = yield* ChatService
    const messages = yield* MessageService

    const first = yield* messages.getOne({ id: job.messageId })
    if (isBlank(first.text)) return yield* Effect.logInfo('chat title skipped: nothing to title')

    const title = yield* assistant.suggestTitle(first.text)

    // Only an untitled chat takes the title, so a rename by the user always wins.
    yield* chats.update({ title: Option.some(title) }, { id: first.chatId, title: Option.none() })
  },
  Effect.catchTags({
    // The cascade takes the first message with its chat, so a missing one means a deleted chat.
    MessageNotFoundError: () => Effect.logInfo('chat title skipped: chat deleted'),
    LlmRefusedError: logAssistantFailure,
    LlmFailedError: logAssistantFailure,
    ChatNotFoundError: () => Effect.logInfo('chat title skipped: chat deleted or titled'),
  }),
  (title, job) => Effect.annotateLogs(title, { messageId: job.messageId }),
)
