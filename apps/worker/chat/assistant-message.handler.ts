import { Context, Effect, Exit, Layer } from 'effect'

import type {
  ChatStatusInvalidError,
  GenerateAssistantMessage,
  MessageStatusInvalidError,
} from '@app-template/application/chat'
import { GenerateAssistantMessageUseCase } from '@app-template/application/use-cases'
import type { AttemptInfo } from '@app-template/packages/queue'

export class AssistantMessageHandler extends Context.Service<
  AssistantMessageHandler,
  {
    /** The last attempt fails the reply on any outcome but success, an interrupt included. */
    readonly handle: (
      job: GenerateAssistantMessage,
      info: AttemptInfo,
    ) => Effect.Effect<void, MessageStatusInvalidError | ChatStatusInvalidError>
  }
>()('@app-template/apps/worker/chat/AssistantMessageHandler', {
  make: Effect.gen(function* () {
    const useCase = yield* GenerateAssistantMessageUseCase

    const handle = Effect.fn('AssistantMessageHandler.handle')(function* (
      job: GenerateAssistantMessage,
      info: AttemptInfo,
    ) {
      if (!info.isLastAttempt) return yield* useCase.generate(job)
      // An exit handler runs uninterruptibly, so a stopping worker waits for the `failed` write.
      yield* useCase.generate(job).pipe(
        Effect.onExit(
          Exit.match({
            onSuccess: () => Effect.void,
            onFailure: (cause) => useCase.fail(job.messageId, cause),
          }),
        ),
      )
    })

    return { handle }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(GenerateAssistantMessageUseCase.layer),
  )
}
