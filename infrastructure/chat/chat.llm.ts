import { Array as Arr, Effect, Option, Schema, String as Str, Stream } from 'effect'
import { type AiError, LanguageModel, Prompt } from 'effect/ai'

import type { Attachment } from '@app-template/domain/attachment'
import { ChatTitle, type Message, maxTitleLength } from '@app-template/domain/chat'

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

const titleInstruction =
  `Write a title of at most ${maxTitleLength} characters for a chat that opens with the next message. Answer with the title alone.` as const

const buildTitlePrompt = (text: string): Prompt.Prompt =>
  Prompt.make([
    { role: 'system', content: titleInstruction },
    { role: 'user', content: [{ type: 'text', text }] },
  ])

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// Whole graphemes, so an emoji is never split, while the length stays within the code units
// `ChatTitle` counts.
const cutToTitleLength = (text: string): string => {
  let cut = ''
  for (const { segment } of graphemes.segment(text)) {
    if (cut.length + segment.length > maxTitleLength) break
    cut += segment
  }
  return cut
}

// Trimmed before the cut so the limit counts visible text, and after it so the cut leaves no edge.
const buildChatTitle = (text: string): Option.Option<ChatTitle> =>
  Schema.decodeUnknownOption(ChatTitle)(Str.trim(cutToTitleLength(Str.trim(text))))

/**
 * A title for a chat opened by `text`, or none when the text or the model's answer is blank.
 *
 * A blank text never reaches the model: providers reject an empty text block.
 */
export const suggestChatTitle = Effect.fn('suggestChatTitle')(function* (
  text: string,
): Effect.fn.Return<Option.Option<ChatTitle>, AiError.AiError, LanguageModel.LanguageModel> {
  if (Str.isEmpty(Str.trim(text))) return Option.none()
  const response = yield* LanguageModel.generateText({ prompt: buildTitlePrompt(text) })
  return buildChatTitle(response.text)
})
