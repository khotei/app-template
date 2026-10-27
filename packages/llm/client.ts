import { Effect, Layer, pipe, String as Str, Stream } from 'effect'
import { LanguageModel, type Response } from 'effect/ai'

const cannedReply =
  'This is the development stub answering one word at a time, so the polling client can watch the reply grow.' as const

const cannedTitle = 'Stub chat title' as const

// Slow enough that a dev poll sees the reply grow instead of finding it already completed.
const wordDelay = '100 millis' as const

const toDelta = (delta: string): Response.StreamPartEncoded => ({
  type: 'text-delta',
  id: 'stub',
  delta,
})

// Splits before each space, so every word after the first carries the space that joins it.
const streamWords = (text: string): Stream.Stream<Response.StreamPartEncoded> =>
  pipe(
    text,
    Str.split(/(?= )/),
    Stream.fromIterable,
    Stream.tap(() => Effect.sleep(wordDelay)),
    Stream.map(toDelta),
  )

export const LanguageModelStub: Layer.Layer<LanguageModel.LanguageModel> = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: 'text', text: cannedTitle }]),
    streamText: () =>
      Stream.make<Array<Response.StreamPartEncoded>>({ type: 'text-start', id: 'stub' }).pipe(
        Stream.concat(streamWords(cannedReply)),
        Stream.concat(Stream.make({ type: 'text-end', id: 'stub' })),
      ),
  }),
)
