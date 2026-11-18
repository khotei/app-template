import { type Config, Effect } from 'effect'
import type { LanguageModel } from 'effect/ai'
import type { HttpClient } from 'effect/http'

import { type LlmConfig, llmConfig } from '@app-template/kernel/config'
import {
  type AnthropicRequestConfig,
  createLanguageModelAnthropic,
} from '@app-template/packages/llm'

/** Anthropic's language model with the model and the settings `purpose` gives it. */
export const createLanguageModel = (purpose: {
  readonly model: (config: LlmConfig) => string
  readonly config: AnthropicRequestConfig
}): Effect.Effect<LanguageModel.LanguageModel, Config.ConfigError, HttpClient.HttpClient> =>
  llmConfig.pipe(
    Effect.flatMap((options) =>
      createLanguageModelAnthropic({
        apiKey: options.apiKey,
        model: purpose.model(options),
        config: purpose.config,
      }),
    ),
  )
