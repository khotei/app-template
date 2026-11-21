import { Cause, Context, Effect, Exit, Layer } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { MessageId } from '#chat/domain/message.util'
import type { ActiveRunNotFoundError, RunStartedError } from '#chat/domain/run.error'
import {
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
     * Run fails `ActiveRunNotFoundError`, unwritten.
     */
    readonly reply: (
      userMessageId: MessageId,
    ) => Effect.Effect<
      void,
      ActiveRunNotFoundError | RunStartedError | MessageAssistantError,
      MessageAssistant
    >
  }
>()('@app-template/application/chat/services/ReplyChatService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageService
    const runs = yield* RunService
    const transaction = yield* Transaction

    // A Run some worker started was left by a worker that died, so it fails as it is read.
    const start = Effect.fnUntraced(function* (userMessageId: MessageId) {
      const active = yield* runs.getActive(userMessageId)
      const queued = yield* ensureRunUnstarted(active).pipe(
        Effect.tapError((error) => runs.update(active, failRun(Cause.fail(error)))),
      )
      return yield* runs.update(queued, startRun)
    })

    const answer = Effect.fnUntraced(function* (started: Run) {
      const assistant = yield* MessageAssistant
      const history = yield* messages.getMany({ chatId: started.chatId })
      const generated = yield* assistant.reply(history)
      // The reply first, as the Run names it; a Run another worker settled meanwhile dies on
      // its update, and the transaction takes the reply back.
      yield* messages
        .create({ chatId: started.chatId, text: generated.text, author: 'assistant' })
        .pipe(
          Effect.flatMap((message) => runs.update(started, completeRun(message))),
          transaction.run,
        )
    })

    function failUnanswered(started: Run, answered: Exit.Exit<unknown, unknown>) {
      return Exit.match(answered, {
        onSuccess: () => Effect.void,
        onFailure: (cause) => runs.update(started, failRun(cause)).pipe(Effect.asVoid),
      })
    }

    // The start runs whole, so whatever ends the answer, an interrupt included, finds the Run it
    // started and fails that one; a Run settled meanwhile makes that write die.
    const reply = Effect.fn('ReplyChatService.reply')((userMessageId: MessageId) =>
      Effect.acquireUseRelease(start(userMessageId), answer, failUnanswered),
    )

    return { reply }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
