import type { Example } from '@oblik/domain/example'
import type { LlmClient } from '@oblik/llm'

export interface ExampleLlm {
  readonly configured: boolean
  buildPrompt(example: Example): string
}

export const createExampleLlm = (client: LlmClient): ExampleLlm => ({
  configured: client.configured,
  buildPrompt: (example) => `Summarise the example "${example.name}".`,
})
