import { AnthropicClient } from '@effect/ai-anthropic'
import { type Config, Duration, Effect, Layer } from 'effect'
import { FetchHttpClient, HttpClient } from 'effect/http'

import { anthropicApiKey } from '@app-template/kernel/config'

// Bun's `fetch` cuts a request that receives nothing for 360 s, and an answer of 16 000 tokens
// arrives whole only at the end, so the idle limit is raised to 10 minutes, Anthropic SDK's own.
const answerIdleLimit: BunFetchRequestInit = { timeout: Duration.toMillis(Duration.minutes(10)) }

const waitForAnswer = HttpClient.transformResponse(
  Effect.provideService(FetchHttpClient.RequestInit, answerIdleLimit),
)

/** Anthropic's client with the key of `ANTHROPIC_API_KEY`, over the `HttpClient` in context. */
export const AnthropicClientFromConfig: Layer.Layer<
  AnthropicClient.AnthropicClient,
  Config.ConfigError,
  HttpClient.HttpClient
> = anthropicApiKey.pipe(
  Effect.map((apiKey) => AnthropicClient.layer({ apiKey, transformClient: waitForAnswer })),
  Layer.unwrap,
)
