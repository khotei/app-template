import { Effect, Layer, Stream } from 'effect'
import { LanguageModel } from 'effect/ai'

const cannedText = 'Stub summary.' as const

export const LanguageModelStub: Layer.Layer<LanguageModel.LanguageModel> = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: 'text', text: cannedText }]),
    streamText: () =>
      Stream.make(
        { type: 'text-start', id: 'stub' },
        { type: 'text-delta', id: 'stub', delta: cannedText },
        { type: 'text-end', id: 'stub' },
      ),
  }),
)
