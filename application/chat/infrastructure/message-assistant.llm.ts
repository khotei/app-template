import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import {
  Array as Arr,
  Context,
  Effect,
  flow,
  identity,
  Layer,
  Option,
  Schema,
  SchemaTransformation,
  String as Str,
} from 'effect'
import type { Prompt } from 'effect/ai'

import { llmModels } from '@app-template/kernel/config'
import { LlmCall } from '@app-template/kernel/llm'
import { LlmError } from '@app-template/kernel/llm/model'

import { type ContextMessage, Message } from '#chat/domain/message.model'
import { RunUsage } from '#chat/domain/run.model'

/** Fixed for every request: a date or user data here would break the cached prefix. */
const systemPrompt = [
  'You are the assistant of a chat app. Answer the last user message, using the whole conversation as context.',
  'Reply in the language of the last user message.',
  'Be accurate and direct. When you do not know something or cannot help, say so plainly instead of guessing.',
].join('\n')

const buildPromptMessage = ({ author, text }: ContextMessage): Prompt.MessageEncoded => ({
  role: author,
  content: [{ type: 'text', text }],
})

const summaryPrompt = [
  'You summarise the earlier part of a conversation between a user and the assistant of a chat app. The assistant keeps answering from your summary once those messages are no longer shown to it, so keep what a later answer may need.',
  'Write the summary under these headings, in this order, leaving out a heading with nothing under it:',
  'User: who the user is and what they want from this conversation.',
  "Standing instructions: what the user asked the assistant to do or to avoid from now on, such as a format, a length, a language or a tone, each in the user's own words.",
  'Facts and decisions: names, numbers, dates and choices. Where the user corrected a value, the latest one, with the value it replaced.',
  'Open: questions not yet answered, requests not yet done, and what the assistant offered or promised.',
  "Assistant's voice: the language it answers in, how it addresses the user, such as a formal or an informal form of address, and how it speaks of itself, its grammatical gender included.",
  'So far: what was asked and answered, in order, in a few sentences each. Keep a detail of a long answer only when a later question may need it.',
  'A summary that opens the conversation is its earlier part: carry over what it holds, unless a later message changes it.',
  'Write in the language of the conversation, addressing no one, in at most 600 words.',
].join('\n')

// One user message: the conversation as a transcript, apart from the request, so neither a
// folded user message nor the model reads the request as the user's words.
const buildSummaryRequest = (messages: ReadonlyArray<ContextMessage>) =>
  buildPromptMessage({
    author: 'user',
    text: [
      '<conversation>',
      ...Arr.map(
        messages,
        ({ author, text }) => `<message author="${author}">\n${text}\n</message>`,
      ),
      '</conversation>',
      '',
      'Summarise the conversation above.',
    ].join('\n'),
  })

/**
 * What a reply's call returns. Decoding drops the U+0000 a message's `text` refuses, as a reply
 * is not refused for it.
 */
export class AssistantReply extends Schema.Class<AssistantReply>('AssistantReply')({
  text: Schema.String.pipe(
    Schema.decodeTo(
      Message.fields.text,
      SchemaTransformation.transform({ decode: Str.replaceAll('\u0000', ''), encode: identity }),
    ),
  ),
  usage: RunUsage,
}) {}

export class MessageAssistant extends Context.Service<
  MessageAssistant,
  {
    /** The next message of a chat, after `messages`, sent as they are. */
    readonly reply: (
      messages: ReadonlyArray<ContextMessage>,
    ) => Effect.Effect<AssistantReply, LlmError>
    /** A summary of `messages`, sent as one transcript, for a context that leaves them out. */
    readonly summarise: (messages: ReadonlyArray<ContextMessage>) => Effect.Effect<string, LlmError>
  }
>()('@app-template/application/chat/infrastructure/MessageAssistant', {
  make: Effect.gen(function* () {
    const { replyModel } = yield* llmModels
    const model = yield* AnthropicLanguageModel.make({
      model: replyModel,
      config: { system: systemPrompt, max_tokens: 16_000, cache_control: { type: 'ephemeral' } },
    })

    // Decoded after the call's retries, a blank reply is not asked again: it would most likely recur.
    const reply = Effect.fn('MessageAssistant.reply')(
      (messages: ReadonlyArray<ContextMessage>) =>
        model.generateText({ prompt: Arr.map(messages, buildPromptMessage) }),
      LlmCall.ask,
      // The usage as the provider counted it; a count or the name it left out fails the decode.
      Effect.map(({ text, usage, content }) => ({
        text,
        usage: {
          model: Arr.findFirst(content, (part) => part.type === 'response-metadata').pipe(
            Option.flatMapNullishOr((part) => part.modelId),
            Option.getOrUndefined,
          ),
          promptTokens: usage.inputTokens.total,
          outputTokens: usage.outputTokens.total,
          cacheReadTokens: usage.inputTokens.cacheRead,
          cacheWriteTokens: usage.inputTokens.cacheWrite,
        },
      })),
      Effect.flatMap(Schema.decodeUnknownEffect(AssistantReply)),
      Effect.catchTag('SchemaError', ({ message }) =>
        Effect.fail(new LlmError({ cause: message })),
      ),
    )

    // The reply's model, as what a cut leaves out fits the window its context fitted.
    const summaryModel = yield* AnthropicLanguageModel.make({
      model: replyModel,
      config: { system: summaryPrompt, max_tokens: 8_000 },
    })

    const summarise = Effect.fn('MessageAssistant.summarise')(
      (messages: ReadonlyArray<ContextMessage>) =>
        summaryModel.generateText({ prompt: [buildSummaryRequest(messages)] }),
      LlmCall.ask,
      Effect.map(({ text }) => text),
      Effect.filterOrFail(
        flow(Str.trim, Str.isNonEmpty),
        () => new LlmError({ cause: 'a blank summary' }),
      ),
    )

    return { reply, summarise }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
