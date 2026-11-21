import { Cause, Context, Effect, Layer } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { ChatBusyError } from '#chat/domain/chat.error'
import { type Chat, ensureChatNotBusy, isNewChat } from '#chat/domain/chat.model'
import type { MessageNotFoundError } from '#chat/domain/message.error'
import type { RunNotRetryableError } from '#chat/domain/run.error'
import { ensureRunRetryable, type Run } from '#chat/domain/run.model'
import { sendReplyToMessage, sendTitleChat } from '#chat/infrastructure/chat.queue'
import { MessageService } from '#chat/services/message.service'
import { MoveRunService } from '#chat/services/move-run.service'
import { RunService } from '#chat/services/run.service'

/**
 * The queue's sender, which a service never names: the process provides it to the caller, so
 * every test layer of the module builds without one.
 */
type Sending = Effect.Services<ReturnType<typeof sendReplyToMessage>>

/** Asks a chat for a reply on the user's behalf, storing the request before it sends its jobs. */
export class AskChatService extends Context.Service<
  AskChatService,
  {
    /**
     * Asks `chat` to reply to the user's `text`: stores the message with its queued Run, then
     * sends a new chat's title job and the reply's job; returns the Run sent, or failed with the
     * full text of SQS's refusal.
     */
    readonly askMessage: (chat: Chat, text: string) => Effect.Effect<Run, ChatBusyError, Sending>
    /**
     * Asks `chat` again to reply to the message its failed newest Run answered: stores a new
     * queued Run of it, then sends the reply's job as `askMessage` does.
     */
    readonly askRetryMessage: (
      chat: Chat,
    ) => Effect.Effect<Run, RunNotRetryableError | MessageNotFoundError, Sending>
  }
>()('@app-template/application/chat/services/AskChatService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageService
    const runs = yield* RunService
    const moves = yield* MoveRunService
    const transaction = yield* Transaction

    // A chat no send has reached yet asks for its title once, from its first message.
    const askTitle = Effect.fnUntraced(function* (chat: Chat) {
      if (!isNewChat(chat)) return
      yield* sendTitleChat(chat)
    })

    // After the commit of `run`, so every delivery finds it; SQS's refusal fails it.
    const askReply = (run: Run) =>
      sendReplyToMessage(run).pipe(
        Effect.as(run),
        Effect.catch((error) => moves.fail(run.userMessageId, Cause.fail(error))),
        // The Run was stored queued a moment before, so a message with no active Run is a defect.
        Effect.orDie,
        // A client's abort mid-send still leaves the Run sent or failed.
        Effect.uninterruptible,
      )

    const askMessage = Effect.fn('AskChatService.askMessage')(function* (chat: Chat, text: string) {
      yield* ensureChatNotBusy(chat.run)

      // The message and its Run commit together: a Run that loses the race keeps no message.
      const run = yield* messages
        .create({ chatId: chat.id, text, author: 'user' })
        .pipe(Effect.flatMap(runs.create), transaction.run)

      // The title's send never fails, so the jobs go in either order.
      yield* askTitle(chat)
      return yield* askReply(run)
    })

    const askRetryMessage = Effect.fn('AskChatService.askRetryMessage')(function* (chat: Chat) {
      const failed = yield* ensureRunRetryable(chat.run)
      const userMessage = yield* messages.getOne({ id: failed.userMessageId })

      const run = yield* runs.create(userMessage)
      return yield* askReply(run)
    })

    return { askMessage, askRetryMessage }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
