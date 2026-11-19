import type { ModelErrors } from '@app-template/kernel/llm'

import {
  type AssistantError,
  AssistantFailedError,
  AssistantRefusedError,
} from '#chat/domain/assistant.error'

/** The assistants' failures, in the words of the chat's domain. */
export const assistantErrors: ModelErrors<AssistantError> = {
  refused: (cause) => new AssistantRefusedError({ cause }),
  failed: (cause) => new AssistantFailedError({ cause }),
}
