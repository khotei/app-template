import { Array as Arr, Effect, Layer, Option, pipe, Schema, String as Str } from 'effect'
import { Prompt } from 'effect/ai'

import {
  Assistant,
  AssistantReply,
  type AttachmentBytes,
  buildChatTitle,
  type HistoryMessage,
  isBlank,
  maxTitleLength,
} from '@app-template/domain/chat'

import { AssistantModels } from '#infrastructure/chat/assistant.client'

const toFilePart = ({ attachment, bytes }: AttachmentBytes): Prompt.FilePartEncoded => ({
  type: 'file',
  mediaType: attachment.mediaType,
  fileName: attachment.fileName,
  data: bytes,
})

// Providers reject an empty text block, so a message sent with attachments only has no text part.
const toTextParts = (text: string): ReadonlyArray<Prompt.TextPartEncoded> =>
  Str.isNonEmpty(text) ? [{ type: 'text', text }] : []

// Fixed for every request: a date or user data here would break the cached prefix.
const systemPrompt = [
  'You are the assistant of a chat app. Answer the last user message, using the whole conversation and every attached file as context.',
  'Reply in the language of the last user message.',
  'Be accurate and direct. When you do not know something or cannot help, say so plainly instead of guessing.',
].join('\n')

// On the key: `annotate` would land on the field's check, which the JSON Schema leaves out.
const ReplyAnswer = Schema.Struct({
  text: AssistantReply.fields.text.annotateKey({
    description: 'The reply the user reads, as plain text.',
  }),
})

const toMessage = ({ message, attachments }: HistoryMessage): Prompt.MessageEncoded => ({
  role: message.author,
  content: pipe(toTextParts(message.text), Arr.appendAll(Arr.map(attachments, toFilePart))),
})

const buildChatPrompt = (history: ReadonlyArray<HistoryMessage>): Prompt.Prompt =>
  pipe(
    history,
    Arr.map(toMessage),
    Arr.prepend<Prompt.MessageEncoded>({ role: 'system', content: systemPrompt }),
    Prompt.make,
  )

const titleInstruction =
  `Write a title of at most ${maxTitleLength} characters for a chat that opens with the next message. Answer with the title alone.` as const

const buildTitlePrompt = (text: string): Prompt.Prompt =>
  Prompt.make([
    { role: 'system', content: titleInstruction },
    { role: 'user', content: [{ type: 'text', text }] },
  ])

export const AssistantLlm: Layer.Layer<Assistant, never, AssistantModels> = Layer.effect(
  Assistant,
  AssistantModels.useSync((models) =>
    Assistant.of({
      reply: Effect.fn('Assistant.reply')(function* (history) {
        const response = yield* models.reply.generateObject({
          prompt: buildChatPrompt(history),
          schema: ReplyAnswer,
        })
        return new AssistantReply(response.value)
      }, Effect.orDie),
      suggestTitle: Effect.fn('Assistant.suggestTitle')(function* (text) {
        if (isBlank(text)) return Option.none()
        const response = yield* models.title.generateText({ prompt: buildTitlePrompt(text) })
        return buildChatTitle(response.text)
      }, Effect.orDie),
    }),
  ),
)
