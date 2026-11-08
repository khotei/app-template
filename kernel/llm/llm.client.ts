import { type Config, Effect, Match, Option } from 'effect'
import type { LanguageModel } from 'effect/ai'
import type { HttpClient } from 'effect/http'

import { LlmConfig } from '@app-template/kernel/config'
import {
  type AnthropicRequestConfig,
  createLanguageModelAnthropic,
  createLanguageModelStub,
} from '@app-template/packages/llm'

type AnthropicOptions = Extract<LlmConfig['Service'], { readonly provider: 'anthropic' }>

// Long enough that a polling client sees the message `generating` before it completes.
const stubDelay = '1 second' as const

/** The language model of the provider `LLM_PROVIDER` names, with the settings `purpose` gives it. */
export const createLanguageModel = (purpose: {
  readonly anthropic: {
    readonly model: (config: AnthropicOptions) => string
    readonly config: AnthropicRequestConfig
  }
  readonly stub: { readonly text: string }
}): Effect.Effect<LanguageModel.LanguageModel, Config.ConfigError, HttpClient.HttpClient> =>
  LlmConfig.use(
    Match.type<LlmConfig['Service']>().pipe(
      Match.discriminatorsExhaustive('provider')({
        stub: () => createLanguageModelStub({ text: purpose.stub.text, delay: stubDelay }),
        anthropic: (options) =>
          createLanguageModelAnthropic({
            apiKey: options.apiKey,
            apiUrl: Option.getOrUndefined(options.apiUrl),
            model: purpose.anthropic.model(options),
            config: purpose.anthropic.config,
          }),
      }),
    ),
  ).pipe(Effect.provide(LlmConfig.layer))
