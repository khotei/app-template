import { Array as Arr, Effect, Layer, Option, String as Str, Stream } from 'effect'
import { LanguageModel, Prompt } from 'effect/ai'

import {
  Assistant,
  type AssistantTurn,
  buildChatTitle,
  maxTitleLength,
} from '@app-template/domain/chat'

const toFilePart = ({
  attachment,
  bytes,
}: AssistantTurn['files'][number]): Prompt.FilePartEncoded => ({
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
      content: [...toTextParts(message.text), ...Arr.map(files, toFilePart)],
    })),
  )

const titleInstruction =
  `Write a title of at most ${maxTitleLength} characters for a chat that opens with the next message. Answer with the title alone.` as const

const buildTitlePrompt = (text: string): Prompt.Prompt =>
  Prompt.make([
    { role: 'system', content: titleInstruction },
    { role: 'user', content: [{ type: 'text', text }] },
  ])

/** The `Assistant` port over `LanguageModel`; a provider failure is a defect. */
export const AssistantLlm: Layer.Layer<Assistant, never, LanguageModel.LanguageModel> =
  Layer.effect(
    Assistant,
    Effect.map(LanguageModel.LanguageModel, (model) =>
      Assistant.of({
        streamText: (history) =>
          model.streamText({ prompt: buildChatPrompt(history) }).pipe(
            Stream.filter((part) => part.type === 'text-delta'),
            Stream.map((part) => part.delta),
            Stream.orDie,
          ),
        suggestTitle: Effect.fn('Assistant.suggestTitle')(function* (text) {
          // A blank text never reaches the model: providers reject an empty text block.
          if (Str.isEmpty(Str.trim(text))) return Option.none()
          const response = yield* model.generateText({ prompt: buildTitlePrompt(text) })
          return buildChatTitle(response.text)
        }, Effect.orDie),
      }),
    ),
  )
