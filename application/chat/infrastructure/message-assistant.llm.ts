import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import {
  Array as Arr,
  Context,
  Effect,
  flow,
  identity,
  Layer,
  Option,
  pipe,
  Schema,
  SchemaTransformation,
  String as Str,
} from 'effect'
import type { Prompt } from 'effect/ai'

import { llmModels } from '@app-template/kernel/config'
import { askModel } from '@app-template/kernel/llm'
import { LlmError } from '@app-template/kernel/llm/error'

import { type ContextMessage, Message } from '#chat/domain/message.model'
import { RunUsage } from '#chat/domain/run.model'

/** The output's limit of a reply's request, and of a summary's, which asks for 1000 words. */
const replyMaxTokens = 16_000
const summaryMaxTokens = 8_000

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
  'You summarise the earlier part of a conversation between a user and the assistant of a chat app, for that assistant to keep answering from once those messages are no longer shown to it.',
  'Keep what a later answer may need: facts, names, numbers, decisions, what the user asked for and prefers, and questions left open. A summary that opens the conversation is part of it: carry over what still matters.',
  'Write in the language of the conversation, as plain prose, addressing no one, in at most 1000 words.',
].join('\n')

const summaryRequest = buildPromptMessage({
  author: 'user',
  text: 'Summarise the conversation above.',
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
    /** The tokens a reply's messages may hold, which a chat's context is cut by. */
    readonly contextTokensLimit: number
    /** The next message of a chat, after `messages`, sent as they are. */
    readonly reply: (
      messages: ReadonlyArray<ContextMessage>,
    ) => Effect.Effect<AssistantReply, LlmError>
    /** A summary of `messages`, sent as they are, for a context that leaves them out. */
    readonly summarise: (messages: ReadonlyArray<ContextMessage>) => Effect.Effect<string, LlmError>
  }
>()('@app-template/application/chat/infrastructure/MessageAssistant', {
  make: Effect.gen(function* () {
    const { replyModel, replyContextTokensLimit } = yield* llmModels
    const model = yield* AnthropicLanguageModel.make({
      model: replyModel,
      config: {
        system: systemPrompt,
        max_tokens: replyMaxTokens,
        cache_control: { type: 'ephemeral' },
      },
    })

    // Decoded after the call's retries, a blank reply is not asked again: it would most likely recur.
    const reply = Effect.fn('MessageAssistant.reply')(
      (messages: ReadonlyArray<ContextMessage>) =>
        model.generateText({ prompt: Arr.map(messages, buildPromptMessage) }),
      askModel({ maxTokens: replyMaxTokens }),
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
      config: { system: summaryPrompt, max_tokens: summaryMaxTokens },
    })

    const summarise = Effect.fn('MessageAssistant.summarise')(
      (messages: ReadonlyArray<ContextMessage>) =>
        summaryModel.generateText({
          prompt: pipe(messages, Arr.map(buildPromptMessage), Arr.append(summaryRequest)),
        }),
      askModel({ maxTokens: summaryMaxTokens }),
      Effect.map(({ text }) => text),
      Effect.filterOrFail(
        flow(Str.trim, Str.isNonEmpty),
        () => new LlmError({ cause: 'a blank summary' }),
      ),
    )

    return { contextTokensLimit: replyContextTokensLimit, reply, summarise }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
