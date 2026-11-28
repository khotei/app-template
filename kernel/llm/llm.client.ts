import { AnthropicClient } from '@effect/ai-anthropic'
import { type Config, Effect, Layer } from 'effect'
import type { HttpClient } from 'effect/http'

import { anthropicApiKey } from '@app-template/kernel/config'

/**
 * Anthropic's client with the key of `ANTHROPIC_API_KEY`, over the `HttpClient` in context.
 *
 * An answer of 16 000 tokens arrives whole only at the end, minutes later, so that client must
 * not end a silent response before `LlmCall.ask`'s ten minutes: Node's `fetch` does after 300 s,
 * `NodeHttpClient.layerUndici` does not.
 */
export const AnthropicClientFromConfig: Layer.Layer<
  AnthropicClient.AnthropicClient,
  Config.ConfigError,
  HttpClient.HttpClient
> = anthropicApiKey.pipe(
  Effect.map((apiKey) => AnthropicClient.layer({ apiKey })),
  Layer.unwrap,
)
