import { Cause, Context, Effect, Layer, Option, Struct, type Types } from 'effect'
import type { SetRequired } from 'type-fest'

import { Transaction } from '@app-template/packages/db'

import type { Chat, ChatBusyError, ChatNotFoundError } from '#chat/domain/chat.model'
import { ChatPolicy } from '#chat/domain/chat-policy'
import { Message } from '#chat/domain/message.model'
import type { Run, RunNotRetryableError } from '#chat/domain/run.model'
import { RunMove } from '#chat/domain/run-move'
import { RunPolicy } from '#chat/domain/run-policy'
import { ChatQueue } from '#chat/infrastructure/chat.queue'
import { ChatService, type ChatWhere } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

/** The chat an ask or a retry acts in, by its id, of the user `userId` names. */
export type AskChatWhere = Types.Simplify<SetRequired<Pick<ChatWhere, 'id' | 'userId'>, 'userId'>>

/**
 * Asks a chat for the assistant's work on the user's behalf, storing what the work reads before it
 * sends its events.
 */
export class AskChatService extends Context.Service<
  AskChatService,
  {
    /**
     * Asks the chat, as its caller read it, for a reply to `text`: stores the message with its
     * queued Run, then sends the message's event; returns the message with the Run sent, or failed
     * with the full text of SQS's refusal.
     */
    readonly ask: (chat: Chat, text: string) => Effect.Effect<Message, ChatBusyError>
    /**
     * Retries the failed newest Run of the user's chat `where` names: stores a new queued Run of
     * its user message, then sends the retry's event, its refusal failing the Run as `ask`'s does.
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

    // Piped on the send of the event the reply listens to, after the commit of `run`, so every
    // delivery finds it: unheard, the Run would stay queued, so SQS's refusal fails that Run alone,
    // by its id; one a worker settled meanwhile, as SQS took the event after all, dies on the
    // write's guard.
    const failRunOnRefusal =
      (run: Run) =>
      <E>(sent: Effect.Effect<void, E>) =>
        sent.pipe(
          Effect.as(run),
          Effect.catch(
            Effect.fnUntraced(function* (error) {
              return yield* runs.update(run, yield* RunMove.fail(run, Cause.fail(error)))
            }),
          ),
        )

    // Uninterruptible whole: a client's abort after the Run commits would leave it queued with no
    // event, its chat busy and its retry refused.
    const ask = Effect.fn('AskChatService.ask')(function* (chat: Chat, text: string) {
      yield* ChatPolicy.ensureNotBusy(chat.run)

      // The message and its Run commit together, and alone: a Run that loses the race keeps no
      // message, and a send inside the transaction could be delivered before its Run commits.
      const { message, run } = yield* Effect.gen(function* () {
        const message = yield* messages.create({
          chatId: chat.id,
          userId: chat.userId,
          text,
          author: 'user',
        })
        const run = yield* runs.create({
          ...Struct.pick(message, ['chatId', 'userId']),
          userMessageId: message.id,
        })
        return { message, run }
      }).pipe(transaction.run)

      const sent = yield* queue.sendUserMessageCreated(message).pipe(failRunOnRefusal(run))
      return new Message({ ...message, run: Option.some(sent) })
    }, Effect.uninterruptible)

    const retry = Effect.fn('AskChatService.retry')(function* (where: AskChatWhere) {
      const chat = yield* chats.getOne({ id: where.id, userId: where.userId })
      const failed = yield* RunPolicy.ensureRetryable(chat.run)

      const run = yield* runs.create(Struct.pick(failed, ['chatId', 'userId', 'userMessageId']))
      return yield* queue
        .sendMessageRetried({
          ...Struct.pick(failed, ['chatId', 'userId']),
          id: failed.userMessageId,
        })
        .pipe(failRunOnRefusal(run))
    }, Effect.uninterruptible)

    return { ask, retry }
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([ChatService.layer, MessageService.layer, RunService.layer, ChatQueue.layer]),
  )
}
