import {
  Array as Arr,
  Effect,
  Layer,
  Option,
  pipe,
  Result,
  Schema,
  String as Str,
  Stream,
} from 'effect'
import { Prompt } from 'effect/ai'

import {
  Assistant,
  type AssistantFile,
  AssistantReply,
  type AssistantTurn,
  buildChatTitle,
  maxTitleLength,
} from '@app-template/domain/chat'

import { AssistantModels } from '#infrastructure/chat/assistant-models.client'

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

/** The `Assistant` port over `AssistantModels`; a provider failure or a blank reply is a defect. */
export const AssistantLlm: Layer.Layer<Assistant, never, AssistantModels> = Layer.effect(
  Assistant,
  AssistantModels.useSync((models) =>
    Assistant.of({
      reply: Effect.fn('Assistant.reply')(function* (history) {
        const text = yield* models.reply.streamText({ prompt: buildChatPrompt(history) }).pipe(
          Stream.filterMap((part) =>
            part.type === 'text-delta' ? Result.succeed(part.delta) : Result.fail(part),
          ),
          Stream.mkString,
        )
        return yield* decodeReply({ text })
      }, Effect.orDie),
      suggestTitle: Effect.fn('Assistant.suggestTitle')(function* (text) {
        if (pipe(text, Str.trim, Str.isEmpty)) return Option.none()
        const response = yield* models.title.generateText({ prompt: buildTitlePrompt(text) })
        return buildChatTitle(response.text)
      }, Effect.orDie),
    }),
  ),
)
