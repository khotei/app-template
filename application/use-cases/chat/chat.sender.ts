import { Cause, Context, DateTime, Effect, Layer } from 'effect'

import {
  assistantMessageQueue,
  chatTitleQueue,
  encodeRun,
  failRun,
  GenerateAssistantMessage,
  GenerateChatTitle,
  type MessageFields,
  type Run,
  RunNotQueuedError,
} from '@app-template/application/chat'
import { RunRepository } from '@app-template/kernel/data'
import { type QueueError, QueueSender } from '@app-template/packages/queue'

export class AssistantMessageSender extends Context.Service<
  AssistantMessageSender,
  {
    /**
     * Sends the job that answers the Run; one SQS refuses fails the Run, so its message offers a
     * retry, and is `RunNotQueuedError`.
     */
    readonly send: (run: Run) => Effect.Effect<void, RunNotQueuedError>
  }
>()('@app-template/application/use-cases/chat/AssistantMessageSender', {
  make: Effect.gen(function* () {
    const queue = yield* QueueSender
    const runs = yield* RunRepository

    const failUnsent = Effect.fnUntraced(function* (run: Run, error: QueueError) {
      const at = yield* DateTime.now
      // The Run was stored queued a moment before, so a refused move is a defect.
      const failed = yield* failRun(run, {
        reason: 'ReplyFailed',
        cause: Cause.pretty(Cause.fail(error)),
        at,
      }).pipe(Effect.orDie)
      yield* encodeRun(failed).pipe(
        Effect.flatMap((row) => runs.update(row, { id: run.id, status: ['queued'] })),
      )
      return yield* new RunNotQueuedError({ id: run.id })
    })

    const send = Effect.fn('AssistantMessageSender.send')((run: Run) =>
      queue
        .send(
          assistantMessageQueue,
          new GenerateAssistantMessage({ chatId: run.chatId, runId: run.id }),
        )
        .pipe(
          Effect.tapError((error) => Effect.logError('assistant message not queued', error)),
          Effect.catchTag('QueueError', (error) => failUnsent(run, error)),
          Effect.annotateLogs({ chatId: run.chatId, runId: run.id }),
        ),
    )

    return { send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}

export class ChatTitleSender extends Context.Service<
  ChatTitleSender,
  {
    /** Sends the job that titles the message's chat; one SQS refuses is logged. */
    readonly send: (message: MessageFields) => Effect.Effect<void>
  }
>()('@app-template/application/use-cases/chat/ChatTitleSender', {
  make: Effect.gen(function* () {
    const queue = yield* QueueSender

    const send = Effect.fn('ChatTitleSender.send')((message: MessageFields) =>
      queue
        .send(
          chatTitleQueue,
          new GenerateChatTitle({ chatId: message.chatId, messageId: message.id }),
        )
        .pipe(
          Effect.tapError((error) => Effect.logError('chat title not queued', error)),
          Effect.catchTag('QueueError', () => Effect.void),
          Effect.annotateLogs({ chatId: message.chatId, messageId: message.id }),
        ),
    )

    return { send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
