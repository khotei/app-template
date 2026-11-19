import { Array as Arr, Cause, Crypto, Data, DateTime, Effect, Exit, Option, Schema } from 'effect'

import {
  Assistant,
  type AssistantReply,
  type Attachment,
  buildAssistantMessage,
  buildFileId,
  buildRunFailureReason,
  completeRun,
  failRun,
  type GenerateAssistantMessage,
  generateRun,
  type HistoryMessage,
  isActiveRun,
  isStartedRun,
  Message,
  MessageFields,
  MessageId,
  prepareRun,
  Run,
  type RunFailureReason,
  type RunId,
  RunService,
} from '@app-template/application/chat'
import { FileRepository, MessageRepository, RunRepository } from '@app-template/kernel/data'
import { decodeRowWith, encodeRowWith, generateId, Transaction } from '@app-template/packages/db'

class ReplySkipped extends Data.TaggedError('ReplySkipped')<{
  readonly why: 'chat deleted' | 'already settled'
}> {}

const logSkipped = ({ why }: ReplySkipped) => Effect.logInfo(`assistant reply skipped: ${why}`)

const readBytes = Effect.fnUntraced(function* (attachment: Attachment) {
  const files = yield* FileRepository

  const file = yield* files.download({ id: buildFileId(attachment) })
  if (Option.isNone(file)) {
    yield* Effect.logWarning('attachment skipped: file missing').pipe(
      Effect.annotateLogs({ attachmentId: attachment.id }),
    )
    return Option.none()
  }
  return Option.some({ attachment, bytes: file.value.blob })
})

const readHistoryMessage = (message: Message) =>
  Effect.forEach(message.attachments, readBytes).pipe(
    Effect.map((found): HistoryMessage => ({ message, attachments: Arr.getSomes(found) })),
  )

const readHistory = (run: Run) =>
  MessageRepository.use((messages) => messages.selectMany({ chatId: run.chatId })).pipe(
    Effect.flatMap(decodeRowWith(Schema.Array(Message))),
    Effect.flatMap(Effect.forEach(readHistoryMessage)),
    Effect.annotateLogs({ chatId: run.chatId, runId: run.id }),
  )

const settleCompleted = Effect.fnUntraced(
  function* (generating: Run, { text }: AssistantReply) {
    const messages = yield* MessageRepository
    const runs = yield* RunService
    const crypto = yield* Crypto.Crypto

    const createdAt = yield* DateTime.now
    const id = yield* generateId(crypto, MessageId.make)
    const reply = buildAssistantMessage({ id, chatId: generating.chatId, text, createdAt })

    // The reply first, as the Run names it; a Run another worker settled meanwhile dies on
    // its update, and the transaction takes the reply back.
    yield* encodeRowWith(MessageFields)(reply).pipe(Effect.flatMap(messages.insert))
    yield* runs.move(generating, (run, at) => completeRun(run, { reply, at }))
  },
  // The reply and the Run's `done` land together, or neither does.
  (settle) => Transaction.use((transaction) => transaction.run(settle)),
)

const settleFailed = Effect.fnUntraced(function* (
  active: Run,
  { reason, cause }: { readonly reason: RunFailureReason; readonly cause: string },
) {
  const runs = yield* RunService

  yield* Effect.logWarning('assistant reply failed').pipe(
    Effect.annotateLogs({ runId: active.id, reason, cause }),
  )
  yield* runs.move(active, (run, at) => failRun(run, { reason, at }))
})

const reply = Effect.fnUntraced(function* (taken: Run) {
  const assistant = yield* Assistant
  const runs = yield* RunService

  const prepared = yield* runs.move(taken, prepareRun)
  const history = yield* readHistory(prepared)
  const generating = yield* runs.move(prepared, generateRun)

  yield* assistant.reply(history).pipe(
    Effect.matchEffect({
      onSuccess: (answer) => settleCompleted(generating, answer),
      onFailure: (error) =>
        settleFailed(generating, { reason: buildRunFailureReason(error), cause: error.cause }),
    }),
  )
})

// The cascade takes the Run with its chat, so a missing one means a deleted chat.
const selectActive = (id: RunId) =>
  RunRepository.use((runs) => runs.selectOne({ id })).pipe(
    Effect.flatMap(decodeRowWith(Schema.Option(Run))),
    Effect.flatMap(Effect.fromOption(() => new ReplySkipped({ why: 'chat deleted' }))),
    Effect.filterOrFail(isActiveRun, () => new ReplySkipped({ why: 'already settled' })),
  )

const fail = Effect.fnUntraced(
  function* (runId: RunId, cause: Cause.Cause<unknown>) {
    const active = yield* selectActive(runId)
    yield* settleFailed(active, { reason: 'ReplyFailed', cause: Cause.pretty(cause) })
  },
  Effect.catchTag('ReplySkipped', logSkipped),
)

const answer = Effect.fnUntraced(function* (active: Run) {
  if (isStartedRun(active)) {
    return yield* settleFailed(active, {
      reason: 'ReplyFailed',
      cause: 'the worker that started the Run stopped before it ended',
    })
  }
  // An exit handler runs uninterruptibly, so a stopping worker waits for the `failed` write.
  yield* reply(active).pipe(
    Effect.onExit(
      Exit.match({
        onSuccess: () => Effect.void,
        onFailure: (cause) => fail(active.id, cause),
      }),
    ),
  )
})

/**
 * Prepares and generates the Run, then completes it with the assistant's message, or fails it
 * with the reason the assistant's error maps to, or with `ReplyFailed` on any other outcome, an
 * interrupt included; a settled Run is skipped. A Run some worker already started is failed
 * unrun, as that worker has died.
 */
export const generateAssistantMessage = Effect.fn('generateAssistantMessage')(
  (job: GenerateAssistantMessage) => selectActive(job.runId).pipe(Effect.flatMap(answer)),
  Effect.catchTag('ReplySkipped', logSkipped),
  // A race is decided by the write's guard on the status its mover read, whose update dies
  // on a Run another worker moved, not by this refusal; a refused move is a bug and dies too.
  Effect.catchTag('RunStatusInvalidError', Effect.die),
)
