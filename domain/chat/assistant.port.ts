import { Context, type Effect, type Option, type Stream } from 'effect'

import type { Attachment } from '#domain/attachment/attachment.model'
import type { ChatTitle } from '#domain/chat/chat.model'
import type { Message } from '#domain/chat/message.model'

export interface AssistantFile {
  readonly attachment: Attachment
  readonly bytes: Uint8Array
}

export interface AssistantTurn {
  readonly message: Message
  readonly files: ReadonlyArray<AssistantFile>
}

export class Assistant extends Context.Service<
  Assistant,
  {
    /** The assistant's text for the chat's next message, as deltas. */
    readonly streamText: (history: ReadonlyArray<AssistantTurn>) => Stream.Stream<string>
    /** A title for a chat opened by `text`; none when the text or the answer is blank. */
    readonly suggestTitle: (text: string) => Effect.Effect<Option.Option<ChatTitle>>
  }
>()('@app-template/domain/chat/Assistant') {}
