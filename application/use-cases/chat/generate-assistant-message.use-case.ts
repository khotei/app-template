import { Array as Arr, Cause, Effect, Exit, Option } from 'effect'

import {
  type AssistantReply,
  type Attachment,
  completeRun,
  FileAttachmentService,
  failRun,
  type GenerateAssistantMessage,
  generateRun,
  type HistoryMessage,
  isActiveRun,
  isStartedRun,
  type Message,
  MessageAssistant,
  MessageService,
  prepareRun,
  type Run,
  type RunFailure,
  type RunId,
  RunService,
} from '@app-template/application/chat'
import { Transaction } from '@app-template/packages/db'

const readBytes = (attachment: Attachment) =>
  FileAttachmentService.use((files) => files.getBytes(attachment)).pipe(
    Effect.map((bytes) => ({ attachment, bytes })),
    Effect.tapError(() =>
      Effect.logWarning('attachment skipped: file missing').pipe(
        Effect.annotateLogs({ attachmentId: attachment.id }),
      ),
    ),
    Effect.option,
  )

const readHistoryMessage = (message: Message) =>
  Effect.forEach(message.attachments, readBytes).pipe(
    Effect.map((found): HistoryMessage => ({ message, attachments: Arr.getSomes(found) })),
  )

const readHistory = (run: Run) =>
  MessageService.use((messages) => messages.getMany({ chatId: run.chatId })).pipe(
    Effect.flatMap(Effect.forEach(readHistoryMessage)),
    Effect.annotateLogs({ chatId: run.chatId, runId: run.id }),
  )

const settleCompleted = Effect.fnUntraced(
  function* (generating: Run, { text }: AssistantReply) {
    const messages = yield* MessageService
    const runs = yield* RunService

    // The reply first, as the Run names it; a Run another worker settled meanwhile dies on
    // its update, and the transaction takes the reply back.
    const reply = yield* messages.create({ chatId: generating.chatId, text, author: 'assistant' })
    yield* runs.move(generating, (run, at) => completeRun(run, { reply, at }))
  },
  // The reply and the Run's `done` land together, or neither does.
  (settle) => Transaction.use((transaction) => transaction.run(settle)),
)

const settleFailed = Effect.fnUntraced(function* (active: Run, { reason, cause }: RunFailure) {
  const runs = yield* RunService

  yield* Effect.logWarning('assistant reply failed').pipe(
    Effect.annotateLogs({ runId: active.id, reason, cause }),
  )
  yield* runs.move(active, (run, at) => failRun(run, { reason, cause, at }))
})

const reply = Effect.fnUntraced(function* (taken: Run) {
  const assistant = yield* MessageAssistant
  const runs = yield* RunService

  const prepared = yield* runs.move(taken, prepareRun)
  const history = yield* readHistory(prepared)
  const generating = yield* runs.move(prepared, generateRun)
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
