import { Cause, Effect, Exit, Option } from 'effect'

import {
  type AssistantReply,
  completeRun,
  failRun,
  type GenerateAssistantMessage,
  generateRun,
  isActiveRun,
  isStartedRun,
  MessageAssistant,
  MessageService,
  prepareRun,
  type Run,
  type RunFailure,
  type RunId,
  RunService,
} from '@app-template/application/chat'
import { Transaction } from '@app-template/packages/db'

const settleCompleted = Effect.fnUntraced(
  function* (generating: Run, { text }: AssistantReply) {
    const messages = yield* MessageService
    const runs = yield* RunService

    // The reply first, as the Run names it; a Run another worker settled meanwhile dies on
    // its update, and the transaction takes the reply back.
    const reply = yield* messages.create({ chatId: generating.chatId, text, author: 'assistant' })
    yield* completeRun(generating, reply).pipe(
      Effect.flatMap((done) => runs.update(done, { id: generating.id, status: generating.status })),
    )
  },
  // The reply and the Run's `done` land together, or neither does.
  (settle) => Transaction.use((transaction) => transaction.run(settle)),
)

const settleFailed = Effect.fnUntraced(function* (active: Run, { reason, cause }: RunFailure) {
  const runs = yield* RunService

  yield* Effect.logWarning('assistant reply failed').pipe(
    Effect.annotateLogs({ runId: active.id, reason, cause }),
  )
  yield* failRun(active, { reason, cause }).pipe(
    Effect.flatMap((failed) => runs.update(failed, { id: active.id, status: active.status })),
  )
})

const reply = Effect.fnUntraced(function* (taken: Run) {
  const assistant = yield* MessageAssistant
  const messages = yield* MessageService
  const runs = yield* RunService

  const prepared = yield* prepareRun(taken).pipe(
    Effect.flatMap((moved) => runs.update(moved, { id: taken.id, status: taken.status })),
  )
  const history = yield* messages.getMany({ chatId: prepared.chatId })
  const generating = yield* generateRun(prepared).pipe(
    Effect.flatMap((moved) => runs.update(moved, { id: prepared.id, status: prepared.status })),
  )
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

/** The reason of a Run that ended with no error to name it: a defect, an interrupt, a dead worker. */
const abortedReason = 'RunAborted'

/** The failure a cause ends a Run with: the tag of the error it holds, and its full text. */
function buildFailure(cause: Cause.Cause<{ readonly _tag: string }>): RunFailure {
  const reason = Cause.findErrorOption(cause).pipe(
    Option.match({ onNone: () => abortedReason, onSome: ({ _tag }) => _tag }),
  )
  return { reason, cause: Cause.pretty(cause) }
}

const answer = Effect.fnUntraced(function* (active: Run) {
  if (isStartedRun(active)) {
    return yield* settleFailed(active, {
      reason: abortedReason,
      cause: 'the worker that started the Run stopped before it ended',
    })
  }
  // An exit handler runs uninterruptibly, so a stopping worker waits for the `failed` write.
  yield* reply(active).pipe(
    Effect.onExit(
      Exit.match({
        onSuccess: () => Effect.void,
        onFailure: (cause) =>
          settleActive(active.id, (latest) => settleFailed(latest, buildFailure(cause))),
      }),
    ),
    // The Run holds the model's failure now, so the job ends.
    Effect.catchTag(['LlmRefusedError', 'LlmFailedError'], () => Effect.void),
  )
})

/**
 * Prepares and generates the Run, then completes it with the assistant's message, or fails it
 * with the failure's tag as its reason, `RunAborted` where no error names it, an interrupt
 * included; a settled Run is skipped. A Run some worker already started is failed unrun, as
 * that worker has died.
 */
export const generateAssistantMessage = Effect.fn('generateAssistantMessage')(
  (job: GenerateAssistantMessage) => settleActive(job.runId, answer),
  // A race is decided by the write's guard on the status its mover read, whose update dies
  // on a Run another worker moved, not by this refusal; a refused move is a bug and dies too.
  Effect.catchTag('RunStatusInvalidError', Effect.die),
)
