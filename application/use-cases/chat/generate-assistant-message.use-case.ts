import {
  Array as Arr,
  Cause,
  Context,
  Crypto,
  Data,
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  type Types,
} from 'effect'

import {
  Assistant,
  type AssistantReply,
  type Attachment,
  buildAssistantMessage,
  buildRunFailure,
  completeRun,
  decodeMessages,
  decodeRun,
  encodeMessage,
  encodeRun,
  failRun,
  type GenerateAssistantMessage,
  generateRun,
  type HistoryMessage,
  isActiveRun,
  isStartedRun,
  type Message,
  MessageId,
  prepareRun,
  type Run,
  type RunFailure,
  type RunId,
  type RunStatus,
} from '@app-template/application/chat'
import { FileRepository, MessageRepository, RunRepository } from '@app-template/kernel/data'
import { generateId, Transaction } from '@app-template/packages/db'

type ReplySkip = 'chatDeleted' | 'alreadySettled'

const replySkipLogs = {
  chatDeleted: Effect.logInfo('assistant reply skipped: chat deleted'),
  alreadySettled: Effect.logInfo('assistant reply skipped: already settled'),
} as const satisfies Record<ReplySkip, Effect.Effect<void>>

class ReplySkipped extends Data.TaggedError('ReplySkipped')<{ readonly why: ReplySkip }> {}

export class GenerateAssistantMessageUseCase extends Context.Service<
  GenerateAssistantMessageUseCase,
  {
    /**
     * Prepares and generates the Run, then completes it with the assistant's message, or fails
     * it with the reason the assistant's error maps to, or with `ReplyFailed` on any other
     * outcome, an interrupt included; a settled Run is skipped. A Run some worker already
     * started is failed unrun, as that worker has died.
     */
    readonly generate: (job: GenerateAssistantMessage) => Effect.Effect<void>
  }
>()('@app-template/application/use-cases/chat/GenerateAssistantMessageUseCase', {
  make: Effect.gen(function* () {
    const assistant = yield* Assistant
    const files = yield* FileRepository
    const messages = yield* MessageRepository
    const runs = yield* RunRepository
    const transaction = yield* Transaction
    const crypto = yield* Crypto.Crypto

    const logMissingFile = (attachment: Attachment) =>
      Effect.logWarning('attachment skipped: file missing').pipe(
        Effect.annotateLogs({ attachmentId: attachment.id }),
      )

    const readBytes = (attachment: Attachment) =>
      files
        .download({ id: attachment.id })
        .pipe(
          Effect.tap(
            Option.match({ onNone: () => logMissingFile(attachment), onSome: () => Effect.void }),
          ),
          Effect.map(Option.map(({ blob }) => ({ attachment, bytes: blob }))),
        )

    const readHistoryMessage = (message: Message) =>
      Effect.forEach(message.attachments, readBytes).pipe(
        Effect.map((found): HistoryMessage => ({ message, attachments: Arr.getSomes(found) })),
      )

    const readHistory = (run: Run) =>
      messages
        .selectMany({ chatId: run.chatId })
        .pipe(
          Effect.flatMap(decodeMessages),
          Effect.flatMap(Effect.forEach(readHistoryMessage)),
          Effect.annotateLogs({ chatId: run.chatId, runId: run.id }),
        )

    const updateRun = (run: Run, from: RunStatus) =>
      encodeRun(run).pipe(Effect.flatMap((row) => runs.update(row, { id: run.id, status: [from] })))

    const settleCompleted = Effect.fnUntraced(
      function* (generating: Run, { text }: AssistantReply) {
        const at = yield* DateTime.now
        const id = yield* generateId(crypto, MessageId.make)
        const reply = buildAssistantMessage({ id, chatId: generating.chatId, text, createdAt: at })
        const completed = yield* completeRun(generating, { reply, at })

        // The reply first, as the Run names it; a Run another worker settled meanwhile dies on
        // its update, and the transaction takes the reply back.
        yield* encodeMessage(reply).pipe(Effect.flatMap(messages.insert))
        yield* updateRun(completed, generating.status)
      },
      // The reply and the Run's `done` land together, or neither does.
      transaction.run,
    )

    const settleFailed = Effect.fnUntraced(function* (
      active: Run,
      { reason, cause }: Types.Simplify<Pick<RunFailure, 'reason' | 'cause'>>,
    ) {
      const at = yield* DateTime.now
      const failed = yield* failRun(active, { reason, cause, at })
      yield* updateRun(failed, active.status)
    })

    const reply = Effect.fnUntraced(function* (taken: Run) {
      const preparedAt = yield* DateTime.now
      const prepared = yield* prepareRun(taken, preparedAt)
      yield* updateRun(prepared, taken.status)

      const history = yield* readHistory(prepared)
      const generatingAt = yield* DateTime.now
      const generating = yield* generateRun(prepared, generatingAt)
      yield* updateRun(generating, prepared.status)

      yield* assistant.reply(history).pipe(
        Effect.matchEffect({
          onSuccess: (answer) => settleCompleted(generating, answer),
          onFailure: (error) => settleFailed(generating, buildRunFailure(error)),
        }),
      )
    })

    // The cascade takes the Run with its chat, so a missing one means a deleted chat.
    const selectActive = (id: RunId) =>
      runs.selectOne({ id }).pipe(
        Effect.flatMap(decodeRun),
        Effect.flatMap(Effect.fromOption(() => new ReplySkipped({ why: 'chatDeleted' }))),
        Effect.filterOrFail(isActiveRun, () => new ReplySkipped({ why: 'alreadySettled' })),
      )

    const fail = Effect.fnUntraced(
      function* (runId: RunId, cause: Cause.Cause<unknown>) {
        const active = yield* selectActive(runId)
        yield* settleFailed(active, { reason: 'ReplyFailed', cause: Cause.pretty(cause) })
      },
      Effect.catchTag('ReplySkipped', ({ why }) => replySkipLogs[why]),
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

    const generate = Effect.fn('GenerateAssistantMessageUseCase.generate')(
      (job: GenerateAssistantMessage) => selectActive(job.runId).pipe(Effect.flatMap(answer)),
      Effect.catchTag('ReplySkipped', ({ why }) => replySkipLogs[why]),
      // A status the model refused means another worker moved the Run first and settles it, so
      // the refusal is logged, never returned to the queue.
      Effect.catch((error) =>
        Effect.logWarning('assistant reply ended by a refused status', error),
      ),
    )

    return { generate }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
