import { Cause, Effect } from 'effect'

import {
  type AssistantReply,
  activeRunStatuses,
  ensureRunQueued,
  type GenerateAssistantMessage,
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
  yield* Effect.logWarning('assistant reply failed', cause)
  yield* moves.fail(active, cause)
})

const reply = Effect.fnUntraced(function* (taken: Run) {
  const assistant = yield* MessageAssistant
  const messages = yield* MessageService
  const moves = yield* MoveRunService

  const prepared = yield* moves.prepare(taken)
  const history = yield* messages.getMany({ chatId: prepared.chatId })
  const generating = yield* moves.generate(prepared)
  const generated = yield* assistant.reply(history)
  yield* settleCompleted(generating, generated)
})

/** The Run while it is active; `RunNotFoundError` once settled, or gone with its chat's cascade. */
const getActiveRun = (id: RunId) =>
  RunService.use((runs) => runs.getOne({ id, status: activeRunStatuses }))

const logSkipped = () => Effect.logInfo('assistant reply skipped: its Run is settled or gone')

/**
 * Fails the Run as it stands now, the reply having moved it; one settled meanwhile is skipped,
 * and a refused move dies, being a bug.
 */
const failLatest = (id: RunId, cause: Cause.Cause<unknown>) =>
  getActiveRun(id).pipe(
    Effect.flatMap((latest) => settleFailed(latest, cause)),
    Effect.catchTag('RunNotFoundError', logSkipped),
    Effect.orDie,
  )

const workerStopped = Cause.die('the worker that started the Run stopped before it ended')

const answer = (run: Run) =>
  reply(run).pipe(
    // On the answer, not the job: an interrupt during the job's read writes nothing, and SQS
    // delivers the job again. An error handler runs uninterruptibly, so a stopping worker waits
    // for the `failed` write; it may not fail, which `failLatest` never does.
    Effect.onError((cause) => failLatest(run.id, cause)),
    Effect.catchTags({
      // The Run holds the model's failure now, so the job ends.
      LlmRefusedError: () => Effect.void,
      LlmFailedError: () => Effect.void,
      // A refused move is a bug: a race dies on the write's guard instead.
      RunStatusInvalidError: Effect.die,
    }),
  )

/**
 * Prepares and generates the Run, then completes it with the assistant's message, or fails it
 * with the full text of what ended it, an interrupt included; a settled Run is skipped. A Run
 * some worker already started is failed unrun, as that worker has died.
 */
export const generateAssistantMessage = Effect.fn('generateAssistantMessage')(
  (job: GenerateAssistantMessage) =>
    getActiveRun(job.runId).pipe(
      Effect.flatMap(ensureRunQueued),
      Effect.flatMap(answer),
      Effect.catchTags({
        RunNotFoundError: logSkipped,
        RunStartedError: ({ id }) => failLatest(id, workerStopped),
      }),
    ),
  (generate, job) => Effect.annotateLogs(generate, { runId: job.runId }),
)
