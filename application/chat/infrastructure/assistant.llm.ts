import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import {
  Array as Arr,
  type Config,
  Duration,
  Effect,
  Layer,
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
import { Assistant, type HistoryMessage } from '#chat/domain/assistant.port'
import { ChatTitle } from '#chat/domain/chat.model'
import { isBlank } from '#chat/domain/message.model'

/** Fixed for every request: a date or user data here would break the cached prefix. */
const systemPrompt = [
  'You are the assistant of a chat app. Answer the last user message, using the whole conversation and every attached file as context.',
  'Reply in the language of the last user message.',
  'Be accurate and direct. When you do not know something or cannot help, say so plainly instead of guessing.',
].join('\n')

/** A blank text says nothing and an empty text block is refused, so it sends only its files. */
function toMessage({ message, attachments }: HistoryMessage): Prompt.MessageEncoded {
  const files = Arr.map(
    attachments,
    ({ attachment, bytes }): Prompt.FilePartEncoded => ({
      type: 'file',
      mediaType: attachment.mediaType,
      fileName: attachment.fileName,
      data: bytes,
    }),
  )
  const text: Prompt.TextPartEncoded = { type: 'text', text: message.text }
  return { role: message.author, content: isBlank(message.text) ? files : Arr.prepend(files, text) }
}

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

const longestRetryAfter = Duration.seconds(30)

const retryAfterOf = ({ retryAfter }: AiError.AiError): Duration.Duration =>
  retryAfter ?? Duration.zero

const isWorthRetrying = (error: AiError.AiError): boolean =>
  error.isRetryable && Duration.isLessThanOrEqualTo(retryAfterOf(error), longestRetryAfter)

/** `retries` more requests, 1, 2, 4 … s apart, each wait at least the provider's `retryAfter`. */
const retrySchedule = (retries: number): Schedule.Schedule<Duration.Duration, AiError.AiError> =>
  Schedule.exponential('1 second').pipe(
    Schedule.upTo({ times: retries }),
    Schedule.setInputType<AiError.AiError>(),
    Schedule.modifyDelay(({ input, duration }) =>
      Effect.succeed(Duration.max(duration, retryAfterOf(input))),
    ),
  )

/** Asks again up to `retries` times while a retry can help, then fails as the port's error. */
const askWithin =
  (retries: number) =>
  <A>(request: Effect.Effect<A, AiError.AiError>) =>
    request.pipe(
      Effect.retry({ schedule: retrySchedule(retries), while: isWorthRetrying }),
      Effect.mapError(toFailedError),
    )

const assistantModels = llmModels.pipe(
  Effect.flatMap(({ replyModel, titleModel }) =>
    Effect.all({
      reply: AnthropicLanguageModel.make({
        model: replyModel,
        config: { system: systemPrompt, max_tokens: 16_000, cache_control: { type: 'ephemeral' } },
      }),
      title: AnthropicLanguageModel.make({
        model: titleModel,
        config: {
          system: titleInstruction,
          max_tokens: 1_000,
          output_config: { effort: 'low' },
          thinking: { type: 'disabled' },
        },
      }),
    }),
  ),
)

export const AssistantLlmFromConfig: Layer.Layer<
  Assistant,
  Config.ConfigError,
  HttpClient.HttpClient
> = Layer.effect(
  Assistant,
  assistantModels.pipe(
    Effect.map((models) =>
      // Checked after the retries, an unfinished answer or a blank reply is not asked again:
      // resent with the same prompt and limits, it would most likely end the same way.
      Assistant.of({
        reply: Effect.fn('Assistant.reply')((history) =>
          models.reply.generateText({ prompt: Arr.map(history, toMessage) }).pipe(
            askWithin(2),
            Effect.filterOrFail(isFinished, toUnfinishedError),
            Effect.flatMap(({ text }) =>
              Schema.decodeEffect(AssistantReply)({ text }).pipe(Effect.mapError(toFailedError)),
            ),
          ),
        ),
        suggestTitle: Effect.fn('Assistant.suggestTitle')((text) =>
          models.title.generateObject({ prompt: text, schema: TitleAnswer }).pipe(
            askWithin(4),
            Effect.filterOrFail(isFinished, toUnfinishedError),
            Effect.map(({ value }) => value.title),
          ),
        ),
      }),
    ),
  ),
).pipe(Layer.provide(AnthropicClientFromConfig))
