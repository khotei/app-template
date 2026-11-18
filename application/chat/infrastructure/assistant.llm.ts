import { AnthropicLanguageModel } from '@effect/ai-anthropic'
import {
  Array as Arr,
  type Config,
  Duration,
  Effect,
  Function as Fn,
  Layer,
  pipe,
  Schedule,
  Schema,
  SchemaTransformation,
  String as Str,
  UndefinedOr,
} from 'effect'
import { AiError, Prompt, Response } from 'effect/ai'
import type { HttpClient } from 'effect/http'

import { llmModels } from '@app-template/kernel/config'
import { maxTitleLength } from '@app-template/kernel/data'
import { AnthropicClientFromConfig } from '@app-template/kernel/llm'

import {
  type AssistantError,
  AssistantFailedError,
  AssistantRefusedError,
} from '#chat/domain/assistant.error'
import { AssistantReply } from '#chat/domain/assistant.model'
import { Assistant, type AttachmentBytes, type HistoryMessage } from '#chat/domain/assistant.port'
import { ChatTitle } from '#chat/domain/chat.model'

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

const titleInstruction = 'Write a title for a chat that opens with the next message.' as const

// The JSON Schema is the encoded side's, so the description sits on the `String` that is trimmed
// into a `ChatTitle`: on `Schema.Trim`, its own `expected` text would replace it.
const TitleAnswer = Schema.Struct({
  title: Schema.String.annotate({
    description: `The title of the chat, in the language of its opening message, at most ${maxTitleLength} characters.`,
  }).pipe(Schema.decodeTo(ChatTitle, SchemaTransformation.trim())),
})

const buildTitlePrompt = (text: string): Prompt.Prompt =>
  Prompt.make([
    { role: 'system', content: titleInstruction },
    { role: 'user', content: [{ type: 'text', text }] },
  ])

const EarlyFinish = Response.FinishReason.pick(['content-filter', 'length'])

const isEarlyFinish = Schema.is(EarlyFinish)

const earlyFinishReasons = {
  'content-filter': AiError.ContentPolicyError,
  length: AiError.InvalidOutputError,
} as const satisfies Record<
  typeof EarlyFinish.Type,
  new (props: {
    readonly description: string
  }) => AiError.AiErrorReason
>

/** Fails an answer whose model refused or was cut; a cut one fails even when it reads whole. */
const failOnEarlyFinish = Effect.fnUntraced(function* <
  A extends { readonly finishReason: Response.FinishReason },
>(answer: A) {
  const reason = answer.finishReason
  if (isEarlyFinish(reason)) {
    return yield* AiError.make({
      module: 'AssistantLlm',
      method: 'failOnEarlyFinish',
      reason: new earlyFinishReasons[reason]({
        description: `The model stopped with finish reason ${reason}`,
      }),
    })
  }
  return answer
})

/** A blank text fails as an output a retry can fix. */
const decodeReply = ({ text }: { readonly text: string }) =>
  Schema.decodeEffect(AssistantReply)({ text }).pipe(
    Effect.mapError((error) =>
      AiError.make({
        module: 'AssistantLlm',
        method: 'decodeReply',
        reason: AiError.InvalidOutputError.fromSchemaError(error),
      }),
    ),
  )

const longestRetryAfter = Duration.seconds(30)

const retryAfterOf = ({ retryAfter }: AiError.AiError): Duration.Duration =>
  UndefinedOr.match(retryAfter, { onUndefined: () => Duration.zero, onDefined: Fn.identity })

const isWorthRetrying = (error: AiError.AiError): boolean =>
  error.isRetryable && Duration.isLessThanOrEqualTo(retryAfterOf(error), longestRetryAfter)

const toAssistantError = (error: AiError.AiError): AssistantError =>
  error.reason._tag === 'ContentPolicyError'
    ? new AssistantRefusedError({ cause: error.message })
    : new AssistantFailedError({ cause: error.message })

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
  <A>(request: Effect.Effect<A, AiError.AiError>): Effect.Effect<A, AssistantError> =>
    request.pipe(
      Effect.retry({ schedule: retrySchedule(retries), while: isWorthRetrying }),
      Effect.mapError(toAssistantError),
    )

const assistantModels = llmModels.pipe(
  Effect.flatMap(({ replyModel, titleModel }) =>
    Effect.all({
      reply: AnthropicLanguageModel.make({
        model: replyModel,
        config: { max_tokens: 16_000, cache_control: { type: 'ephemeral' } },
      }),
      title: AnthropicLanguageModel.make({
        model: titleModel,
        config: {
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
      Assistant.of({
        reply: Effect.fn('Assistant.reply')((history) =>
          models.reply
            .generateText({ prompt: buildChatPrompt(history) })
            .pipe(Effect.flatMap(failOnEarlyFinish), Effect.flatMap(decodeReply), askWithin(2)),
        ),
        suggestTitle: Effect.fn('Assistant.suggestTitle')(function* (text) {
          const response = yield* models.title
            .generateObject({ prompt: buildTitlePrompt(text), schema: TitleAnswer })
            .pipe(Effect.flatMap(failOnEarlyFinish), askWithin(4))
          return response.value.title
        }),
      }),
    ),
  ),
).pipe(Layer.provide(AnthropicClientFromConfig))
