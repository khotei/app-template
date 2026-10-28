import { Cause, Effect, Exit, Layer } from 'effect'

import { GenerateAssistantMessageUseCase } from '@app-template/application/chat'
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
) {
  const useCase = yield* GenerateAssistantMessageUseCase
  if (!info.isLastAttempt) return yield* useCase.generate(job)
  // An exit handler runs uninterruptibly, so a stopping worker waits for the `failed` write.
  yield* Effect.onExit(useCase.generate(job), (exit) =>
    Exit.isSuccess(exit) ? Effect.void : useCase.fail(job.messageId, exit.cause),
  )
})

export const handleDeadLettered = Effect.fn('AssistantMessageHandler.handleDeadLettered')(
  function* (job: GenerateAssistantMessage, info: AttemptInfo) {
    const useCase = yield* GenerateAssistantMessageUseCase
    const cause = `dead-lettered after ${info.attempt} attempts on ${assistantMessageDeadLetterQueue.name}`
    const failed = yield* useCase.fail(job.messageId, Cause.fail(cause))
    if (failed) yield* Effect.logError('assistant reply dead-lettered')
  },
)

export const AssistantMessageHandler = Layer.mergeAll(
  worker(assistantMessageQueue, handle),
  worker(assistantMessageDeadLetterQueue, handleDeadLettered),
).pipe(Layer.provide(GenerateAssistantMessageUseCase.layer))
