import { Cause, Context, Effect, Layer, Struct, type Types } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { ChatBusyError, ChatNotFoundError } from '#chat/domain/chat.error'
import type { Chat } from '#chat/domain/chat.model'
import type { RunNotRetryableError } from '#chat/domain/run.error'
import type { Run } from '#chat/domain/run.model'
import { ChatQueue } from '#chat/infrastructure/chat.queue'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

/** The chat an ask or a retry acts in, by its id, of the user `userId` names. */
export type AskChatWhere = Types.Simplify<Pick<Run, 'chatId' | 'userId'>>

/**
 * Asks a chat for the assistant's work on the user's behalf, storing what the work reads before it
 * sends its jobs.
 */
export class AskChatService extends Context.Service<
  AskChatService,
  {
    /**
     * Asks the user's chat `where` names for a reply to `text`: stores the message with its queued
     * Run, then sends a new chat's title job and the reply's; returns the Run sent, or failed with
     * the full text of SQS's refusal. Another user's chat is not found.
     */
    readonly ask: (
      where: AskChatWhere,
      text: string,
    ) => Effect.Effect<Run, ChatNotFoundError | ChatBusyError>
    /**
     * Retries the failed newest Run of the user's chat `where` names: stores a new queued Run of
     * its user message, then sends the reply's job as `ask` does.
     */
    readonly retry: (
      where: AskChatWhere,
    ) => Effect.Effect<Run, ChatNotFoundError | RunNotRetryableError>
  }
>()('@app-template/application/chat/services/AskChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatService
    const messages = yield* MessageService
    const runs = yield* RunService
    const transaction = yield* Transaction
    const queue = yield* ChatQueue

    // After the commit of `run`, so every delivery finds it; SQS's refusal fails that Run alone,
    // by its id: one a worker settled meanwhile, as SQS took the job after all, dies on the
    // write's guard.
    const askReply = Effect.fnUntraced(
      function* (run: Run) {
        yield* queue.sendReplyToMessage(run)
        return run
      },
      (sent, run) =>
        Effect.catch(
          sent,
          Effect.fnUntraced(function* (error) {
            return yield* runs.update(run, yield* run.fail(Cause.fail(error)))
          }),
        ),
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

    // `askIn` and `retryIn` are uninterruptible: a client's abort after the Run commits would leave
    // it queued with no job, its chat busy and its retry refused, so one that began runs to its
    // send. The chat's read before them stays interruptible, so an abort there stops the request.
    const askIn = Effect.fnUntraced(function* (chat: Chat, text: string) {
      yield* chat.ensureNotBusy()
      const run = yield* createMessageRun(chat, text)

      // A chat no ask has reached yet is titled once, from its first message; the title's send
      // never fails, so the jobs go in either order.
      if (chat.isNew) yield* queue.sendTitleChat(chat)
      return yield* askReply(run)
    }, Effect.uninterruptible)

    const retryIn = Effect.fnUntraced(function* (chat: Chat) {
      const failed = yield* chat.ensureRetryable()
      const run = yield* runs.create(Struct.pick(failed, ['chatId', 'userId', 'userMessageId']))
      return yield* askReply(run)
    }, Effect.uninterruptible)

    const ask = Effect.fn('AskChatService.ask')(function* (
      { chatId, userId }: AskChatWhere,
      text: string,
    ) {
      const chat = yield* chats.getOne({ id: chatId, userId })
      return yield* askIn(chat, text)
    })

    const retry = Effect.fn('AskChatService.retry')(function* ({ chatId, userId }: AskChatWhere) {
      const chat = yield* chats.getOne({ id: chatId, userId })
      return yield* retryIn(chat)
    })

    return { ask, retry }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer, RunService.layer, ChatQueue.layer]),
  )
}
