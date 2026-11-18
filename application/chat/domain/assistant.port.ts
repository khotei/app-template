import { Context, type Effect } from 'effect'

import type { AssistantError } from '#chat/domain/assistant.error'
import type { AssistantReply } from '#chat/domain/assistant.model'
import type { Attachment } from '#chat/domain/attachment.model'
import type { ChatTitle } from '#chat/domain/chat.model'
import type { MessageFields } from '#chat/domain/message.model'

export interface HistoryMessage {
  readonly message: MessageFields
  readonly attachments: ReadonlyArray<{
    readonly attachment: Attachment
    readonly bytes: Uint8Array
  }>
}

export class Assistant extends Context.Service<
  Assistant,
  {
    /** The next message of the chat whose completed messages are `history`, oldest first. */
    readonly reply: (
      history: ReadonlyArray<HistoryMessage>,
    ) => Effect.Effect<AssistantReply, AssistantError>
    /**
     * A title for a chat opened by `text`, which is never blank; an answer that fails the title's
     * schema is asked again, then fails.
     */
    readonly suggestTitle: (text: string) => Effect.Effect<ChatTitle, AssistantError>
  }
>()('@app-template/application/chat/domain/Assistant') {}
