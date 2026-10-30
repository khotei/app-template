import { Context, type Effect, type Option } from 'effect'

import type { Attachment } from '#domain/attachment/attachment.model'
import type { AssistantFailedError, AssistantRefusedError } from '#domain/chat/assistant.error'
import type { AssistantReply } from '#domain/chat/assistant.model'
import type { ChatTitle } from '#domain/chat/chat.model'
import type { Message } from '#domain/chat/message.model'

export interface AttachmentBytes {
  readonly attachment: Attachment
  readonly bytes: Uint8Array
}

export interface HistoryMessage {
  readonly message: Message
  readonly attachments: ReadonlyArray<AttachmentBytes>
}

/** Both errors are final: the adapter has spent its retries or knows none would help. */
export class Assistant extends Context.Service<
  Assistant,
  {
    /** The next message of the chat whose completed messages are `history`, oldest first. */
    readonly reply: (
      history: ReadonlyArray<HistoryMessage>,
    ) => Effect.Effect<AssistantReply, AssistantRefusedError | AssistantFailedError>
    /** A title for a chat opened by `text`; none when the text or the answer is blank. */
    readonly suggestTitle: (
      text: string,
    ) => Effect.Effect<Option.Option<ChatTitle>, AssistantRefusedError | AssistantFailedError>
  }
>()('@app-template/domain/chat/Assistant') {}
