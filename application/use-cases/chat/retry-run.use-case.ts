import { Context, Effect, Layer } from 'effect'

import {
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  ensureChatNotBusy,
  ensureRunRetryable,
  type MessageId,
  type MessageNotFoundError,
  MessageService,
  type Run,
  type RunNotQueuedError,
  type RunNotRetryableError,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

import { AssistantMessageSender } from '#use-cases/chat/chat.sender'

export class RetryRunUseCase extends Context.Service<
  RetryRunUseCase,
  {
    /**
     * Stores a new queued Run of the user's message after its failed one, then sends its job.
     */
    readonly retry: (
      userId: UserId,
      chatId: ChatId,
      userMessageId: MessageId,
    ) => Effect.Effect<
      Run,
      | MessageNotFoundError
      | ChatNotFoundError
      | ChatBusyError
      | RunNotRetryableError
      | RunNotQueuedError
    >
  }
>()('@app-template/application/use-cases/chat/RetryRunUseCase', {
  make: Effect.gen(function* () {
    const chatService = yield* ChatService
    const messageService = yield* MessageService
    const runService = yield* RunService
    const replySender = yield* AssistantMessageSender

    const retry = Effect.fn('RetryRunUseCase.retry')(function* (
      userId: UserId,
      chatId: ChatId,
      userMessageId: MessageId,
    ) {
      const userMessage = yield* messageService.getOne({
        id: userMessageId,
        chatId,
        userId,
        author: 'user',
      })
      yield* chatService.getOne({ id: chatId, userId }).pipe(
        Effect.tap(ensureChatNotBusy),
        Effect.tap((chat) => ensureRunRetryable(chat.run, userMessage.id)),
      )

      const run = yield* runService.create(userMessage)
      yield* replySender.send(run)
      return run
    })

    return { retry }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([
      AssistantMessageSender.layer,
      ChatService.layer,
      MessageService.layer,
      RunService.layer,
    ]),
  )
}
