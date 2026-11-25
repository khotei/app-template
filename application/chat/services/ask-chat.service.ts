import { Cause, Context, Effect, Layer, Struct } from 'effect'

import { Transaction } from '@app-template/packages/db'
import { QueueSender } from '@app-template/packages/queue'

import type { ChatBusyError } from '#chat/domain/chat.error'
import type { Chat } from '#chat/domain/chat.model'
import type { RunNotRetryableError } from '#chat/domain/run.error'
import { failRun, type Run } from '#chat/domain/run.model'
import { sendReplyToMessage, sendTitleChat } from '#chat/infrastructure/chat.queue'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

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
    readonly ask: (chat: Chat, text: string) => Effect.Effect<Run, ChatBusyError>
    /**
     * Retries `chat`'s failed newest Run: stores a new queued Run of its user message, then
     * sends the reply's job as `ask` does.
     */
    readonly retry: (chat: Chat) => Effect.Effect<Run, RunNotRetryableError>
  }
>()('@app-template/application/chat/services/AskChatService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageService
    const runs = yield* RunService
    const transaction = yield* Transaction
    const queue = yield* QueueSender
    const provideQueue = Effect.provideService(QueueSender, queue)

    // After the commit of `run`, so every delivery finds it; SQS's refusal fails that Run alone,
    // by its id: one a worker settled meanwhile, as SQS took the job after all, dies on the
    // write's guard.
    const askReply = Effect.fnUntraced(
      function* (run: Run) {
        yield* sendReplyToMessage(run)
        return run
      },
      (sent, run) =>
        Effect.catch(sent, (error) => runs.move(run, (run) => failRun(run, Cause.fail(error)))),
    )

    // The message and its Run commit together: a Run that loses the race keeps no message.
    const createMessageRun = Effect.fnUntraced(function* (chat: Chat, text: string) {
      const message = yield* messages.create({
        chatId: chat.id,
        userId: chat.userId,
        text,
        author: 'user',
      })
      return yield* runs.create({
        ...Struct.pick(message, ['chatId', 'userId']),
        userMessageId: message.id,
      })
    }, transaction.run)

    // `ask` and `retry` are uninterruptible: a client's abort after the Run commits would leave it
    // queued with no job, its chat busy and its retry refused, so one that began runs to its send.
    const ask = Effect.fn('AskChatService.ask')(
      function* (chat: Chat, text: string) {
        yield* chat.ensureNotBusy()
        const run = yield* createMessageRun(chat, text)

        // A chat no ask has reached yet is titled once, from its first message; the title's send
        // never fails, so the jobs go in either order.
        if (chat.isNew) yield* sendTitleChat(chat)
        return yield* askReply(run)
      },
      Effect.uninterruptible,
      provideQueue,
    )

    const retry = Effect.fn('AskChatService.retry')(
      function* (chat: Chat) {
        const failed = yield* chat.ensureRetryable()
        const run = yield* runs.create(Struct.pick(failed, ['chatId', 'userId', 'userMessageId']))
        return yield* askReply(run)
      },
      Effect.uninterruptible,
      provideQueue,
    )

    return { ask, retry }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
