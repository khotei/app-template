import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic'
import { type Config, Context, Effect, Layer, Match, type Redacted } from 'effect'
import type { LanguageModel } from 'effect/ai'
import type { HttpClient } from 'effect/http'

import { LlmConfig } from '@app-template/config'
import { createLanguageModelStub } from '@app-template/llm'

export interface AnthropicOptions {
  readonly apiKey: Redacted.Redacted
  readonly replyModel: string
  readonly titleModel: string
}

// Long enough that a polling client sees the message `generating` before it completes.
const stubDelay = '1 second' as const

const stubReply = 'This is the development stub answering the whole reply at once.' as const

const stubTitle = 'Stub chat title' as const

export class AssistantModels extends Context.Service<
  AssistantModels,
  {
    readonly provider: string
    readonly replyModel: string
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
        reply: AnthropicLanguageModel.make({ model: replyModel }),
        title: AnthropicLanguageModel.make({ model: titleModel }),
      }).pipe(Effect.map((models) => ({ provider: 'anthropic', replyModel, ...models }))),
    ).pipe(Layer.provide(AnthropicClient.layer({ apiKey })))

  static readonly layerStub: Layer.Layer<AssistantModels> = Layer.effect(
    this,
    Effect.all({
      reply: createLanguageModelStub({ text: stubReply, delay: stubDelay }),
      title: createLanguageModelStub({ text: stubTitle, delay: stubDelay }),
    }).pipe(Effect.map((models) => ({ provider: 'stub', replyModel: 'stub', ...models }))),
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
