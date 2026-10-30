import { Cause, Effect, Exit, Layer, Option } from 'effect'

import { GenerateAssistantMessageUseCase } from '@app-template/application/chat'
import type { ChatStatusInvalidError, MessageStageInvalidError } from '@app-template/domain/chat'
import {
  assistantMessageDeadLetterQueue,
  assistantMessageQueue,
  type GenerateAssistantMessage,
} from '@app-template/infrastructure/chat'
import { type AttemptInfo, worker } from '@app-template/queue'

/** The last attempt fails the reply on any outcome but success, an interrupt included. */
export const handle = Effect.fn('AssistantMessageHandler.handle')(function* (
  job: GenerateAssistantMessage,
  info: AttemptInfo,
): Effect.fn.Return<
  void,
  MessageStageInvalidError | ChatStatusInvalidError,
  GenerateAssistantMessageUseCase
> {
  const useCase = yield* GenerateAssistantMessageUseCase
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

export const handleDeadLettered = Effect.fn('AssistantMessageHandler.handleDeadLettered')(
  function* (
    job: GenerateAssistantMessage,
    info: AttemptInfo,
  ): Effect.fn.Return<
    void,
    MessageStageInvalidError | ChatStatusInvalidError,
    GenerateAssistantMessageUseCase
  > {
    const useCase = yield* GenerateAssistantMessageUseCase

    const cause = `dead-lettered after ${info.attempt} attempts on ${assistantMessageDeadLetterQueue.name}`

    const failed = yield* useCase.fail(job.messageId, Cause.fail(cause))

    if (Option.isSome(failed)) yield* Effect.logError('assistant reply dead-lettered')
  },
)

export const AssistantMessageHandler = Layer.mergeAll(
  worker(assistantMessageQueue, handle),
  worker(assistantMessageDeadLetterQueue, handleDeadLettered),
).pipe(Layer.provide(GenerateAssistantMessageUseCase.layer))
