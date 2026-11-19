import { Effect, Option } from 'effect'

import {
  ChatAssistant,
  ChatService,
  type GenerateChatTitle,
  isBlank,
  MessageService,
} from '@app-template/application/chat'
import type { LlmError } from '@app-template/kernel/llm/error'

const logAssistantFailure = (error: LlmError) =>
  Effect.logWarning('chat title skipped: the assistant failed').pipe(
    Effect.annotateLogs({ error: error._tag, cause: error.cause }),
  )

/**
 * Titles the chat its first message opened; a chat gone or titled meanwhile, or an assistant
 * error, is logged and skipped.
 */
export const generateChatTitle = Effect.fn('generateChatTitle')(function* (job: GenerateChatTitle) {
  const assistant = yield* ChatAssistant
  const chats = yield* ChatService
  const messages = yield* MessageService

  // The cascade takes the first message with its chat, so a missing one means a deleted chat.
  const first = yield* messages.getOne({ id: job.messageId }).pipe(Effect.option)
  if (Option.isNone(first)) return yield* Effect.logInfo('chat title skipped: chat deleted')
  if (isBlank(first.value.text)) {
    return yield* Effect.logInfo('chat title skipped: nothing to title')
  }

  const title = yield* assistant.suggestTitle(first.value.text)

  // Only an untitled chat takes the title, so a rename by the user always wins.
  yield* chats
    .rename({ id: first.value.chatId, title: Option.none() }, title)
    .pipe(
      Effect.catchTag('ChatNotFoundError', () =>
        Effect.logInfo('chat title skipped: chat deleted or titled'),
      ),
    )
}, Effect.catch(logAssistantFailure))
