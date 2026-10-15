export interface LlmClientOptions {
  readonly apiKey: string
}

export interface LlmClient {
  readonly configured: boolean
}

export const createLlmClient = (options: LlmClientOptions): LlmClient => ({
  configured: options.apiKey !== '',
})
