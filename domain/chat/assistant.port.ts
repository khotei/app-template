import { Context, type Effect, type Option } from 'effect'

import type { Attachment } from '#domain/attachment/attachment.model'
import type { AssistantError } from '#domain/chat/assistant.error'
import type { AssistantReply } from '#domain/chat/assistant.model'
import type { ChatTitle } from '#domain/chat/chat.model'
import type { Message, MessageProvenance } from '#domain/chat/message.model'

export interface AttachmentBytes {
  readonly attachment: Attachment
  readonly bytes: Uint8Array
}

export interface HistoryMessage {
  readonly message: Message
  readonly attachments: ReadonlyArray<AttachmentBytes>
}

export class Assistant extends Context.Service<
  Assistant,
  {
    /** Who answers replies and with which instructions; fixed for the process's life. */
    readonly replyProvenance: MessageProvenance
    /** The next message of the chat whose completed messages are `history`, oldest first. */
    readonly reply: (
      history: ReadonlyArray<HistoryMessage>,
    ) => Effect.Effect<AssistantReply, AssistantError>
    /**
     * A title for a chat opened by `text`, none only for a blank `text`; an answer that fails the
     * title's schema is asked again, then fails.
     */
    readonly suggestTitle: (text: string) => Effect.Effect<Option.Option<ChatTitle>, AssistantError>
  }
>()('@app-template/domain/chat/Assistant') {}
