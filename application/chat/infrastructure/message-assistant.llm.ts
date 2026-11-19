import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import { Array as Arr, Context, Effect, Layer, pipe, Schema } from 'effect'
import type { Prompt } from 'effect/ai'

import { llmModels } from '@app-template/kernel/config'
import { askModel } from '@app-template/kernel/llm'

import type { AssistantError } from '#chat/domain/assistant.error'
import {
  AssistantReply,
  type AttachmentBytes,
  type HistoryMessage,
} from '#chat/domain/assistant.model'
import { isBlank } from '#chat/domain/message.model'
import { assistantErrors } from '#chat/infrastructure/assistant.llm'

/** Fixed for every request: a date or user data here would break the cached prefix. */
const systemPrompt = [
  'You are the assistant of a chat app. Answer the last user message, using the whole conversation and every attached file as context.',
  'Reply in the language of the last user message.',
  'Be accurate and direct. When you do not know something or cannot help, say so plainly instead of guessing.',
].join('\n')

const toFilePart = ({ attachment, bytes }: AttachmentBytes): Prompt.FilePartEncoded => ({
  type: 'file',
  mediaType: attachment.mediaType,
  fileName: attachment.fileName,
  data: bytes,
})

/** A blank text says nothing and an empty text block is refused, so it sends no text part. */
const toTextParts = (text: string): ReadonlyArray<Prompt.TextPartEncoded> =>
  isBlank(text) ? [] : [{ type: 'text', text }]

const toMessage = ({ message, attachments }: HistoryMessage): Prompt.MessageEncoded => ({
  role: message.author,
  content: pipe(toTextParts(message.text), Arr.appendAll(Arr.map(attachments, toFilePart))),
})

export class MessageAssistant extends Context.Service<
  MessageAssistant,
  {
    /** The next message of the chat whose completed messages are `history`, oldest first. */
    readonly reply: (
      history: ReadonlyArray<HistoryMessage>,
    ) => Effect.Effect<AssistantReply, AssistantError>
  }
>()('@app-template/application/chat/infrastructure/MessageAssistant', {
  make: Effect.gen(function* () {
    const { replyModel } = yield* llmModels
    const model = yield* AnthropicLanguageModel.make({
      model: replyModel,
      config: { system: systemPrompt, max_tokens: 16_000, cache_control: { type: 'ephemeral' } },
    })

    // Decoded after the retries, a blank reply is not asked again: it would most likely recur.
    const reply = Effect.fn('MessageAssistant.reply')(
      (history: ReadonlyArray<HistoryMessage>) =>
        model.generateText({ prompt: Arr.map(history, toMessage) }),
      askModel(assistantErrors),
      Effect.flatMap(({ text }) =>
        Schema.decodeEffect(AssistantReply)({ text }).pipe(
          Effect.mapError(({ message }) => assistantErrors.failed(message)),
        ),
      ),
    )

    return { reply }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
