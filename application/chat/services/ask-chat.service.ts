import { Cause, Context, Effect, Layer } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { ChatBusyError } from '#chat/domain/chat.error'
import { type Chat, ensureChatNotBusy, isNewChat } from '#chat/domain/chat.model'
import type { MessageNotFoundError } from '#chat/domain/message.error'
import type { RunNotRetryableError } from '#chat/domain/run.error'
import { ensureRunRetryable, failRun, type Run } from '#chat/domain/run.model'
import { sendReplyToMessage, sendTitleChat } from '#chat/infrastructure/chat.queue'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

/**
 * The queue's sender, which a service never names: the process provides it to the caller, so
 * every test layer of the module builds without one.
 */
type Sending = Effect.Services<ReturnType<typeof sendReplyToMessage>>

/**
 * Asks a chat for the assistant's work on the user's behalf, storing what the work reads before it
 * sends its jobs.
 */
export class AskChatService extends Context.Service<
  AskChatService,
  {
    /**
     * Asks `chat` for a reply to the user's `text`: stores the message with its queued Run, then
     * sends a new chat's title job and the reply's; returns the Run sent, or failed with the full
     * text of SQS's refusal.
     */
    readonly ask: (chat: Chat, text: string) => Effect.Effect<Run, ChatBusyError, Sending>
    /**
     * Retries `chat`'s failed newest Run: stores a new queued Run of its user message, then
     * sends the reply's job as `ask` does.
     */
    readonly retry: (
      chat: Chat,
    ) => Effect.Effect<Run, RunNotRetryableError | MessageNotFoundError, Sending>
  }
>()('@app-template/application/chat/services/AskChatService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageService
    const runs = yield* RunService
    const transaction = yield* Transaction

    // After the commit of `run`, so every delivery finds it; SQS's refusal fails that Run alone,
    // by its id: one a worker settled meanwhile, as SQS took the job after all, dies on the
    // write's guard.
    const askReply = (run: Run) =>
      sendReplyToMessage(run).pipe(
        Effect.as(run),
        Effect.catch((error) => runs.move(run, (run) => failRun(run, Cause.fail(error)))),
        // A client's abort mid-send still leaves the Run sent or failed.
        Effect.uninterruptible,
      )

    const ask = Effect.fn('AskChatService.ask')(function* (chat: Chat, text: string) {
      yield* ensureChatNotBusy(chat.run)

      // The message and its Run commit together: a Run that loses the race keeps no message.
      const run = yield* messages
        .create({ chatId: chat.id, text, author: 'user' })
        .pipe(Effect.flatMap(runs.create), transaction.run)

      // A chat no ask has reached yet is titled once, from its first message; the title's send
      // never fails, so the jobs go in either order.
      if (isNewChat(chat)) yield* sendTitleChat(chat)
      return yield* askReply(run)
    })

    const retry = Effect.fn('AskChatService.retry')(function* (chat: Chat) {
      const failed = yield* ensureRunRetryable(chat.run)
      const userMessage = yield* messages.getOne({ id: failed.userMessageId })

      const run = yield* runs.create(userMessage)
      return yield* askReply(run)
    })

    return { ask, retry }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
