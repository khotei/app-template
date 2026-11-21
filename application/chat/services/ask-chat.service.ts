import { Context, Effect, Layer } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { ChatBusyError } from '#chat/domain/chat.error'
import { type Chat, ensureChatNotBusy } from '#chat/domain/chat.model'
import type { MessageNotFoundError } from '#chat/domain/message.error'
import type { RunNotRetryableError } from '#chat/domain/run.error'
import { ensureRunRetryable, type Run } from '#chat/domain/run.model'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

/**
 * Asks a chat for a reply, under the rules of the chat as read: stores the queued Run that will
 * answer the user's message. The caller sends its job after the commit.
 */
export class AskChatService extends Context.Service<
  AskChatService,
  {
    /** Stores the user's `text` in `chat` and the queued Run that answers it, together. */
    readonly ask: (chat: Chat, text: string) => Effect.Effect<Run, ChatBusyError>
    /** Stores a new queued Run of the message the chat's failed newest Run answered. */
    readonly retry: (chat: Chat) => Effect.Effect<Run, RunNotRetryableError | MessageNotFoundError>
  }
>()('@app-template/application/chat/services/AskChatService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageService
    const runs = yield* RunService
    const transaction = yield* Transaction

    const ask = Effect.fn('AskChatService.ask')(function* (chat: Chat, text: string) {
      yield* ensureChatNotBusy(chat.run)

      // The message and its Run commit together: a Run that loses the race keeps no message.
      return yield* messages
        .create({ chatId: chat.id, text, author: 'user' })
        .pipe(Effect.flatMap(runs.create), transaction.run)
    })

    const retry = Effect.fn('AskChatService.retry')(function* (chat: Chat) {
      const failed = yield* ensureRunRetryable(chat.run)
      const userMessage = yield* messages.getOne({ id: failed.userMessageId })
      return yield* runs.create(userMessage)
    })

    return { ask, retry }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
