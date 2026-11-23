import { type Cause, Context, Effect, Layer } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { MessageId } from '#chat/domain/message.util'
import type { RunNotFoundError, RunStartedError } from '#chat/domain/run.error'
import {
  activeRunStatuses,
  completeRun,
  ensureRunUnstarted,
  failRun,
  type Run,
  startRun,
} from '#chat/domain/run.model'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

/** The assistant's failures, named through it, as a service imports no part of the kernel. */
type MessageAssistantError = Effect.Error<ReturnType<MessageAssistant['Service']['reply']>>

/** Replies to a user's message through its active Run. */
export class ReplyChatService extends Context.Service<
  ReplyChatService,
  {
    /**
     * Replies to the user's message `userMessageId` through its active Run, which ends `done`
     * with the assistant's message, or `failed` with the full text of what ended it, an interrupt
     * and `RunStartedError`, for a Run some worker started, included. A message with no active
     * Run fails `RunNotFoundError`, unwritten.
     */
    readonly reply: (
      userMessageId: MessageId,
    ) => Effect.Effect<
      void,
      RunNotFoundError | RunStartedError | MessageAssistantError,
      MessageAssistant
    >
  }
>()('@app-template/application/chat/services/ReplyChatService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageService
    const runs = yield* RunService
    const transaction = yield* Transaction

    // Fails `run` with what ended its work; a Run settled meanwhile makes that write die.
    const failUnanswered =
      (run: Run) =>
      <E>(cause: Cause.Cause<E>) =>
        runs.move(run, (run) => failRun(run, cause))

    // One transaction, open across the model's call: the reply is written first, as the Run names
    // it, and a Run another worker settled meanwhile dies on its update, taking the reply back.
    const answer = Effect.fnUntraced(function* (started: Run) {
      const assistant = yield* MessageAssistant
      const history = yield* messages.getMany({ chatId: started.chatId })
      const generated = yield* assistant.reply(history)
      const message = yield* messages.create({
        chatId: started.chatId,
        text: generated.text,
        author: 'assistant',
      })
      yield* runs.move(started, (run) => completeRun(run, message))
    }, transaction.run)

    // Uninterruptible but for the answer: an interrupt that lands while the Run starts waits for
    // the answer, so the Run it started is always there to fail and never stays `generating`; the
    // answer alone is interruptible, so the worker can still stop during the model's call.
    const reply = Effect.fn('ReplyChatService.reply')(function* (userMessageId: MessageId) {
      const active = yield* runs.getOne({ userMessageId, status: activeRunStatuses })
      // A Run some worker started was left by a worker that died, so it fails as it is read.
      const queued = yield* ensureRunUnstarted(active).pipe(Effect.onError(failUnanswered(active)))
      const started = yield* runs.move(queued, startRun)

      yield* Effect.interruptible(answer(started)).pipe(Effect.onError(failUnanswered(started)))
    }, Effect.uninterruptible)

    return { reply }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
