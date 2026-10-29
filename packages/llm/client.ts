import { type Duration, Effect, Stream } from 'effect'
import { LanguageModel, type Response } from 'effect/ai'

export const createLanguageModelStub = ({
  text,
  delay,
}: {
  readonly text: string
  readonly delay: Duration.Input
}): Effect.Effect<LanguageModel.LanguageModel> =>
  LanguageModel.make({
    generateText: () =>
      Effect.succeed<Array<Response.PartEncoded>>([{ type: 'text', text }]).pipe(
        Effect.delay(delay),
      ),
    streamText: () =>
      Effect.succeed<Array<Response.StreamPartEncoded>>([
        { type: 'text-start', id: 'stub' },
        { type: 'text-delta', id: 'stub', delta: text },
        { type: 'text-end', id: 'stub' },
      ]).pipe(Effect.delay(delay), Stream.fromIterableEffect),
  })
