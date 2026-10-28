import { Cause, Effect, Exit, Layer } from 'effect'

import {
  assistantMessageDeadLetterQueue,
  assistantMessageQueue,
  type GenerateAssistantMessage,
} from '@app-template/infrastructure/chat'
import { type AttemptInfo, worker } from '@app-template/queue'

import { GenerateAssistantMessageUseCase } from '#application/chat/generate-assistant-message.use-case'

/** The last attempt fails the reply on any outcome but success, an interrupt included. */
export const handle = Effect.fn('AssistantMessageJob.handle')(function* (
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

export const handleDeadLettered = Effect.fn('AssistantMessageJob.handleDeadLettered')(function* (
  job: GenerateAssistantMessage,
  info: AttemptInfo,
) {
  const useCase = yield* GenerateAssistantMessageUseCase
  yield* Effect.logError('assistant reply dead-lettered')
  const cause = `dead-lettered after ${info.attempt} attempts on ${assistantMessageDeadLetterQueue.name}`
  yield* useCase.fail(job.messageId, Cause.fail(cause))
})

export const AssistantMessageJob = Layer.mergeAll(
  worker(assistantMessageQueue, handle),
  worker(assistantMessageDeadLetterQueue, handleDeadLettered),
).pipe(Layer.provide(GenerateAssistantMessageUseCase.layer))
