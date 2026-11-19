import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import {
  Array as Arr,
  type Config,
  Duration,
  Effect,
  Layer,
  pipe,
  Schedule,
  Schema,
  SchemaTransformation,
} from 'effect'
import type { AiError, Prompt, Response } from 'effect/ai'
import type { HttpClient } from 'effect/http'

import { llmModels } from '@app-template/kernel/config'
import { maxTitleLength } from '@app-template/kernel/data'
import { AnthropicClientFromConfig } from '@app-template/kernel/llm'

import { AssistantFailedError, AssistantRefusedError } from '#chat/domain/assistant.error'
import { AssistantReply } from '#chat/domain/assistant.model'
import { Assistant, type AttachmentBytes, type HistoryMessage } from '#chat/domain/assistant.port'
import { ChatTitle } from '#chat/domain/chat.model'
import { isBlank } from '#chat/domain/message.model'

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

const titleInstruction = `Write a title of at most ${maxTitleLength} characters, in the language of the next message, for a chat that opens with it.`

/** A bare `String`: `Schema.Trim` would send the model its `expected` text as a description. */
const TitleAnswer = Schema.Struct({
  title: Schema.String.pipe(Schema.decodeTo(ChatTitle, SchemaTransformation.trim())),
})

const isFinished = ({ finishReason }: { readonly finishReason: Response.FinishReason }) =>
  finishReason === 'stop'

function toUnfinishedError({ finishReason }: { readonly finishReason: Response.FinishReason }) {
  const cause = `the model stopped with finish reason ${finishReason}`
  return finishReason === 'content-filter'
    ? new AssistantRefusedError({ cause })
    : new AssistantFailedError({ cause })
}

const toFailedError = (error: { readonly message: string }) =>
  new AssistantFailedError({ cause: error.message })

const retryAfterOf = ({ retryAfter }: AiError.AiError) => retryAfter ?? Duration.zero

/** A `retryAfter` over 30 s, such as a daily token limit's, would outlast the job. */
const isWorthRetrying = (error: AiError.AiError) =>
  error.isRetryable && Duration.isLessThanOrEqualTo(retryAfterOf(error), Duration.seconds(30))

/** 1, 2 … s apart, each wait at least the provider's `retryAfter`. */
const retrySchedule = Schedule.exponential('1 second').pipe(
  Schedule.setInputType<AiError.AiError>(),
  Schedule.modifyDelay(({ input, duration }) =>
    Effect.succeed(Duration.max(duration, retryAfterOf(input))),
  ),
)

const retryPassing = <A>(request: Effect.Effect<A, AiError.AiError>) =>
  Effect.retry(request, { times: 2, while: isWorthRetrying, schedule: retrySchedule })

export const AssistantLlmFromConfig: Layer.Layer<
  Assistant,
  Config.ConfigError,
  HttpClient.HttpClient
> = Layer.effect(
  Assistant,
  Effect.gen(function* () {
    const { replyModel, titleModel } = yield* llmModels
    const replies = yield* AnthropicLanguageModel.make({
      model: replyModel,
      config: { system: systemPrompt, max_tokens: 16_000, cache_control: { type: 'ephemeral' } },
    })
    const titles = yield* AnthropicLanguageModel.make({
      model: titleModel,
      config: {
        system: titleInstruction,
        max_tokens: 1_000,
        output_config: { effort: 'low' },
        thinking: { type: 'disabled' },
      },
    })

    // Checked after the retries, an unfinished answer or a blank reply is not asked again:
    // resent with the same prompt and limits, it would most likely end the same way.
    return Assistant.of({
      reply: Effect.fn('Assistant.reply')(
        (history) => replies.generateText({ prompt: Arr.map(history, toMessage) }),
        retryPassing,
        Effect.mapError(toFailedError),
        Effect.filterOrFail(isFinished, toUnfinishedError),
        Effect.flatMap(({ text }) =>
          Schema.decodeEffect(AssistantReply)({ text }).pipe(Effect.mapError(toFailedError)),
        ),
      ),
      suggestTitle: Effect.fn('Assistant.suggestTitle')(
        (text) => titles.generateObject({ prompt: text, schema: TitleAnswer }),
        retryPassing,
        Effect.mapError(toFailedError),
        Effect.filterOrFail(isFinished, toUnfinishedError),
        Effect.map(({ value }) => value.title),
      ),
    })
  }),
).pipe(Layer.provide(AnthropicClientFromConfig))
