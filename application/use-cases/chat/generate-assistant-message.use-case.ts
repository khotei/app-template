import { Cause, Effect, Exit, Option } from 'effect'

import {
  type AssistantReply,
  type GenerateAssistantMessage,
  isActiveRun,
  isStartedRun,
  MessageAssistant,
  MessageService,
  MoveRunService,
  type Run,
  type RunId,
  RunService,
} from '@app-template/application/chat'
import { Transaction } from '@app-template/packages/db'

const settleCompleted = Effect.fnUntraced(
  function* (generating: Run, { text }: AssistantReply) {
    const messages = yield* MessageService
    const moves = yield* MoveRunService

    // The reply first, as the Run names it; a Run another worker settled meanwhile dies on
    // its update, and the transaction takes the reply back.
    const reply = yield* messages.create({ chatId: generating.chatId, text, author: 'assistant' })
    yield* moves.complete(generating, reply)
  },
  // The reply and the Run's `done` land together, or neither does.
  (settle) => Transaction.use((transaction) => transaction.run(settle)),
)

const settleFailed = Effect.fnUntraced(function* (active: Run, cause: Cause.Cause<unknown>) {
  const moves = yield* MoveRunService

  yield* Effect.logWarning('assistant reply failed').pipe(
    Effect.annotateLogs({ runId: active.id, cause: Cause.pretty(cause) }),
  )
  yield* moves.fail(active, cause)
})

const reply = Effect.fnUntraced(function* (taken: Run) {
  const assistant = yield* MessageAssistant
  const messages = yield* MessageService
  const moves = yield* MoveRunService

  const prepared = yield* moves.prepare(taken)
  const history = yield* messages.getMany({ chatId: prepared.chatId })
  const generating = yield* moves.generate(prepared)
  const answer = yield* assistant.reply(history)
  yield* settleCompleted(generating, answer)
})

/**
 * Runs `settle` on the Run while it is active; one settled meanwhile, or gone with its chat (the
 * cascade takes the Run with it), is skipped.
 */
const settleActive = <A, E, R>(id: RunId, settle: (active: Run) => Effect.Effect<A, E, R>) =>
  RunService.use((runs) => runs.getOne({ id })).pipe(
    Effect.map(Option.liftPredicate<Run>(isActiveRun)),
    Effect.catchTag('RunNotFoundError', () => Effect.succeedNone),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.logInfo('assistant reply skipped: its Run is settled or gone'),
        onSome: settle,
      }),
    ),
  )

const answer = Effect.fnUntraced(function* (active: Run) {
  if (isStartedRun(active)) {
    return yield* settleFailed(
      active,
      Cause.die('the worker that started the Run stopped before it ended'),
    )
  }
  // An exit handler runs uninterruptibly, so a stopping worker waits for the `failed` write.
  yield* reply(active).pipe(
    Effect.onExit(
      Exit.match({
        onSuccess: () => Effect.void,
        onFailure: (cause) => settleActive(active.id, (latest) => settleFailed(latest, cause)),
      }),
    ),
    // The Run holds the model's failure now, so the job ends.
    Effect.catchTag(['LlmRefusedError', 'LlmFailedError'], () => Effect.void),
  )
})

/**
 * Prepares and generates the Run, then completes it with the assistant's message, or fails it
 * with the full text of what ended it, an interrupt included; a settled Run is skipped. A Run some worker already started is failed unrun, as
 * that worker has died.
 */
export const generateAssistantMessage = Effect.fn('generateAssistantMessage')(
  (job: GenerateAssistantMessage) => settleActive(job.runId, answer),
  // A race is decided by the write's guard on the status its mover read, whose update dies
  // on a Run another worker moved, not by this refusal; a refused move is a bug and dies too.
  Effect.catchTag('RunStatusInvalidError', Effect.die),
)
