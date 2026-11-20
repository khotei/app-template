import { Cause, Context, Effect, Layer } from 'effect'

import { Transaction } from '@app-template/packages/db'

import type { AssistantReply } from '#chat/domain/assistant.model'
import type {
  RunNotFoundError,
  RunStartedError,
  RunStatusInvalidError,
} from '#chat/domain/run.error'
import type { Run } from '#chat/domain/run.model'
import type { RunId } from '#chat/domain/run.util'
import { sendGenerateAssistantMessage } from '#chat/infrastructure/chat.queue'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { MessageService } from '#chat/services/message.service'
import { MoveRunService } from '#chat/services/move-run.service'

/**
 * The queue's sender, which a service never names: the process provides it to the caller, so
 * every test layer of the module builds without one.
 */
type Sending = Effect.Services<ReturnType<typeof sendGenerateAssistantMessage>>

/** The assistant's failures, named through it, as a service imports no part of the kernel. */
type AssistantError = Effect.Error<ReturnType<MessageAssistant['Service']['reply']>>

/** Sends a Run's job after the commit of the Run it names, and runs it, settling each on the Run. */
export class JobRunService extends Context.Service<
  JobRunService,
  {
    /** Answers the Run sent, or failed with the full text of SQS's refusal. */
    readonly send: (run: Run) => Effect.Effect<Run, never, Sending>
    /**
     * Takes the Run `id` for its job, generates its reply and settles it: `done` with the
     * assistant's message, or `failed` with the full text of what ended it, an interrupt
     * included. A Run settled or gone fails `RunNotFoundError`, and one some worker started
     * `RunStartedError`, both unwritten.
     */
    readonly reply: (
      id: RunId,
    ) => Effect.Effect<
      void,
      RunNotFoundError | RunStartedError | RunStatusInvalidError | AssistantError,
      MessageAssistant
    >
  }
>()('@app-template/application/chat/services/JobRunService', {
  make: Effect.gen(function* () {
    const messages = yield* MessageService
    const moves = yield* MoveRunService
    const transaction = yield* Transaction

    const send = Effect.fn('JobRunService.send')((run: Run) =>
      sendGenerateAssistantMessage(run).pipe(
        Effect.as(run),
        Effect.catch((error) => moves.fail(run.id, Cause.fail(error))),
        // The Run was stored queued a moment before, so a Run gone or a refused move is a defect.
        Effect.orDie,
        // A client's abort mid-send still leaves the Run sent or failed.
        Effect.uninterruptible,
      ),
    )

    /** Writes the reply and the Run's `done` together, or neither. */
    const settleCompleted = Effect.fnUntraced(function* (
      generating: Run,
      { text }: AssistantReply,
    ) {
      // The reply first, as the Run names it; a Run another worker settled meanwhile dies on
      // its update, and the transaction takes the reply back.
      const reply = yield* messages.create({ chatId: generating.chatId, text, author: 'assistant' })
      yield* moves.complete(generating, reply)
    }, transaction.run)

    const answer = Effect.fnUntraced(function* (prepared: Run) {
      const assistant = yield* MessageAssistant

      const history = yield* messages.getMany({ chatId: prepared.chatId })
      const generating = yield* moves.generate(prepared)
      const generated = yield* assistant.reply(history)
      yield* settleCompleted(generating, generated)
    })

    const reply = Effect.fn('JobRunService.reply')(function* (id: RunId) {
      const prepared = yield* moves.prepare(id)
      // On the answer, not on `prepare`: an interrupt during `prepare` leaves the Run at most
      // `preparing`, which the next delivery fails as started. The handler runs uninterruptibly;
      // a Run it finds settled or gone is a lost race and dies, joining the answer's cause: two
      // deliveries never both pass `prepare`'s guarded write, so only a deleted chat or a copy
      // delivered meanwhile, failing the Run as started, settles it under this flow.
      yield* answer(prepared).pipe(
        Effect.onError((cause) => moves.fail(prepared.id, cause).pipe(Effect.orDie)),
      )
    })

    return { send, reply }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
