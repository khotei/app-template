import { Effect, Layer, Stream } from 'effect'
import { type AiError, LanguageModel, type Prompt, type Response } from 'effect/ai'

export interface LanguageModelScript {
  readonly streamText?: Stream.Stream<Response.StreamPartEncoded, AiError.AiError>
  readonly generateText?: Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>
}

/** A language model answering from `script`, recording every prompt; an unscripted call dies. */
export const recordLanguageModel = (script: LanguageModelScript) => {
  const prompts: Array<Prompt.Prompt> = []
  const layer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (options) => {
        prompts.push(options.prompt)
        return script.generateText ?? Effect.die('generateText is not scripted')
      },
      streamText: (options) => {
        prompts.push(options.prompt)
        return script.streamText ?? Stream.die('streamText is not scripted')
      },
    }),
  )
  return { prompts, layer }
}
