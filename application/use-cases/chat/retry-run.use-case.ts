import { Context, Effect, Layer } from 'effect'

import {
  assistantMessageQueue,
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  ensureChatNotBusy,
  ensureRunRetryable,
  GenerateAssistantMessage,
  type MessageId,
  type MessageNotFoundError,
  MessageService,
  type Run,
  type RunNotRetryableError,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import { QueueSender } from '@app-template/packages/queue'

export class RetryRunUseCase extends Context.Service<
  RetryRunUseCase,
  {
    /**
     * Stores a new queued Run of the user's message after its failed one, then sends its job; a
     * send SQS refuses dies, leaving the Run queued.
     */
    readonly retry: (
      userId: UserId,
      chatId: ChatId,
      userMessageId: MessageId,
    ) => Effect.Effect<
      Run,
      MessageNotFoundError | ChatNotFoundError | ChatBusyError | RunNotRetryableError
    >
  }
>()('@app-template/application/use-cases/chat/RetryRunUseCase', {
  make: Effect.gen(function* () {
    const chatService = yield* ChatService
    const messageService = yield* MessageService
    const runService = yield* RunService
    const queue = yield* QueueSender

    const retry = Effect.fn('RetryRunUseCase.retry')(function* (
      userId: UserId,
      chatId: ChatId,
      userMessageId: MessageId,
    ) {
      const userMessage = yield* messageService.getOne({ id: userMessageId, chatId, userId })
      yield* chatService.getOne({ id: chatId, userId }).pipe(
        Effect.tap(ensureChatNotBusy),
        Effect.tap((chat) => ensureRunRetryable(chat.run, userMessage.id)),
      )

      const run = yield* runService.create(userMessage)
      yield* queue
        .send(assistantMessageQueue, new GenerateAssistantMessage({ chatId, runId: run.id }))
        .pipe(Effect.orDie)
      return run
    })

    return { retry }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([ChatService.layer, MessageService.layer, RunService.layer]),
  )
}
