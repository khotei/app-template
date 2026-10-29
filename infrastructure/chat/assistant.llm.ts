import { Array as Arr, Effect, Layer, Option, pipe, Schema, String as Str, Stream } from 'effect'
import { LanguageModel, Prompt } from 'effect/ai'

import {
  Assistant,
  type AssistantFile,
  AssistantReply,
  type AssistantTurn,
  buildChatTitle,
  maxTitleLength,
} from '@app-template/domain/chat'

const toFilePart = ({ attachment, bytes }: AssistantFile): Prompt.FilePartEncoded => ({
  type: 'file',
  mediaType: attachment.mediaType,
  fileName: attachment.fileName,
  data: bytes,
})

// Providers reject an empty text block, so a message sent with files only has no text part.
const toTextParts = (text: string): ReadonlyArray<Prompt.TextPartEncoded> =>
  Str.isNonEmpty(text) ? [{ type: 'text', text }] : []

const buildChatPrompt = (history: ReadonlyArray<AssistantTurn>): Prompt.Prompt =>
  Prompt.make(
    Arr.map(history, ({ message, files }) => ({
      role: message.author,
      content: pipe(toTextParts(message.text), Arr.appendAll(Arr.map(files, toFilePart))),
    })),
  )

const decodeReply = Schema.decodeEffect(AssistantReply)

const titleInstruction =
  `Write a title of at most ${maxTitleLength} characters for a chat that opens with the next message. Answer with the title alone.` as const

const buildTitlePrompt = (text: string): Prompt.Prompt =>
  Prompt.make([
    { role: 'system', content: titleInstruction },
    { role: 'user', content: [{ type: 'text', text }] },
  ])

/** The `Assistant` port over `LanguageModel`; a provider failure or a blank reply is a defect. */
export const AssistantLlm: Layer.Layer<Assistant, never, LanguageModel.LanguageModel> =
  Layer.effect(
    Assistant,
    LanguageModel.LanguageModel.useSync((model) =>
      Assistant.of({
        reply: Effect.fn('Assistant.reply')(function* (history) {
          const text = yield* model.streamText({ prompt: buildChatPrompt(history) }).pipe(
            Stream.filter((part) => part.type === 'text-delta'),
            Stream.map((part) => part.delta),
            Stream.mkString,
          )
          return yield* decodeReply({ text })
        }, Effect.orDie),
        suggestTitle: Effect.fn('Assistant.suggestTitle')(function* (text) {
          // A blank text never reaches the model, as `toTextParts` keeps empty text out.
          if (pipe(text, Str.trim, Str.isEmpty)) return Option.none()
          const response = yield* model.generateText({ prompt: buildTitlePrompt(text) })
          return buildChatTitle(response.text)
        }, Effect.orDie),
      }),
    ),
  )
