import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic'
import { type Config, Context, Duration, Effect, Layer, Match } from 'effect'
import type { LanguageModel } from 'effect/ai'
import { FetchHttpClient, HttpClient } from 'effect/http'

import { LlmConfig } from '@app-template/config'
import { createLanguageModelStub } from '@app-template/llm'

type AnthropicOptions = Extract<LlmConfig['Service'], { readonly provider: 'anthropic' }>

// Long enough that a polling client sees the message `generating` before it completes.
const stubDelay = '1 second' as const

const stubReply = JSON.stringify({
  text: 'This is the development stub answering the whole reply at once.',
})

const stubTitle = JSON.stringify({ title: 'Stub chat title' })

// Bun's `fetch` cuts a request that receives nothing for 360 s, and an answer of 16 000 tokens
// arrives whole only at the end, so the idle limit is raised to 10 minutes, Anthropic SDK's own.
const answerIdleLimit: BunFetchRequestInit = { timeout: Duration.toMillis(Duration.minutes(10)) }

const waitForAnswer = HttpClient.transformResponse(
  Effect.provideService(FetchHttpClient.RequestInit, answerIdleLimit),
)

export class AssistantModels extends Context.Service<
  AssistantModels,
  {
    readonly reply: LanguageModel.LanguageModel
    readonly title: LanguageModel.LanguageModel
  }
>()('@app-template/infrastructure/chat/AssistantModels') {
  static readonly layerAnthropic = ({
    apiKey,
    replyModel,
    titleModel,
  }: AnthropicOptions): Layer.Layer<AssistantModels, never, HttpClient.HttpClient> =>
    Layer.effect(
      this,
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
    ).pipe(Layer.provide(AnthropicClient.layer({ apiKey, transformClient: waitForAnswer })))

  static readonly layerStub: Layer.Layer<AssistantModels> = Layer.effect(
    this,
    Effect.all({
      reply: createLanguageModelStub({ text: stubReply, delay: stubDelay }),
      title: createLanguageModelStub({ text: stubTitle, delay: stubDelay }),
    }),
  )

  static readonly layerFromConfig: Layer.Layer<
    AssistantModels,
    Config.ConfigError,
    HttpClient.HttpClient
  > = LlmConfig.useSync(
    Match.type<LlmConfig['Service']>().pipe(
      Match.discriminatorsExhaustive('provider')({
        stub: () => AssistantModels.layerStub,
        anthropic: AssistantModels.layerAnthropic,
      }),
    ),
  ).pipe(Layer.unwrap, Layer.provide(LlmConfig.layer))
}
