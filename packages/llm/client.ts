import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic'
import { Duration, Effect, type Redacted, Stream, type Types } from 'effect'
import { LanguageModel, type Response } from 'effect/ai'
import { FetchHttpClient, HttpClient } from 'effect/http'

/** The settings an Anthropic model sends with every request, but the model's name. */
export type AnthropicRequestConfig = Types.Simplify<
  Omit<typeof AnthropicLanguageModel.Config.Service, 'model'>
>

// Bun's `fetch` cuts a request that receives nothing for 360 s, and an answer of 16 000 tokens
// arrives whole only at the end, so the idle limit is raised to 10 minutes, Anthropic SDK's own.
const answerIdleLimit: BunFetchRequestInit = { timeout: Duration.toMillis(Duration.minutes(10)) }

const waitForAnswer = HttpClient.transformResponse(
  Effect.provideService(FetchHttpClient.RequestInit, answerIdleLimit),
)

export const createLanguageModelAnthropic = ({
  apiKey,
  model,
  config,
}: {
  readonly apiKey: Redacted.Redacted
  readonly model: string
  readonly config: AnthropicRequestConfig
}): Effect.Effect<LanguageModel.LanguageModel, never, HttpClient.HttpClient> =>
  AnthropicLanguageModel.make({ model, config }).pipe(
    Effect.provideServiceEffect(
      AnthropicClient.AnthropicClient,
      AnthropicClient.make({ apiKey, transformClient: waitForAnswer }),
    ),
  )

export const createLanguageModelStub = ({
  text,
  delay,
}: {
  readonly text: string
  readonly delay: Duration.Input
}): Effect.Effect<LanguageModel.LanguageModel> =>
  LanguageModel.make({
    generateText: () =>
      Effect.succeed<Array<Response.PartEncoded>>([{ type: 'text', text }]).pipe(
        Effect.delay(delay),
      ),
    streamText: () =>
      Effect.succeed<Array<Response.StreamPartEncoded>>([
        { type: 'text-start', id: 'stub' },
        { type: 'text-delta', id: 'stub', delta: text },
        { type: 'text-end', id: 'stub' },
      ]).pipe(Effect.delay(delay), Stream.fromIterableEffect),
  })
