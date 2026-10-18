import { Array as Arr, String as Str, Stream } from 'effect'
import { type AiError, LanguageModel, Prompt } from 'effect/ai'

import type { Attachment } from '@app-template/domain/attachment'
import type { Message } from '@app-template/domain/chat'

export interface ChatFile {
  readonly attachment: Attachment
  readonly bytes: Uint8Array
}

export interface ChatTurn {
  readonly message: Message
  readonly files: ReadonlyArray<ChatFile>
}

const toFilePart = ({ attachment, bytes }: ChatFile): Prompt.FilePartEncoded => ({
  type: 'file',
  mediaType: attachment.mediaType,
  fileName: attachment.fileName,
  data: bytes,
})

// Providers reject an empty text block, so a message sent with files only has no text part.
const toTextParts = (text: string): ReadonlyArray<Prompt.TextPartEncoded> =>
  Str.isNonEmpty(text) ? [{ type: 'text', text }] : []

/** Maps each turn, in the order given, to a provider message of its author's role. */
export const buildChatPrompt = (turns: ReadonlyArray<ChatTurn>): Prompt.Prompt =>
  Prompt.make(
    Arr.map(turns, ({ message, files }) => ({
      role: message.author,
      content: [...toTextParts(message.text), ...Arr.map(files, toFilePart)],
    })),
  )

/** The reply's text as the model streams it, one delta per element. */
export const streamAssistantText = (
  prompt: Prompt.Prompt,
): Stream.Stream<string, AiError.AiError, LanguageModel.LanguageModel> =>
  LanguageModel.streamText({ prompt }).pipe(
    Stream.filter((part) => part.type === 'text-delta'),
    Stream.map((part) => part.delta),
  )
