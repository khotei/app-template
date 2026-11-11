import { Cause, Context, DateTime, Effect, Layer, Option } from 'effect'

import {
  type AttachmentBoundError,
  type AttachmentNotFoundError,
  assistantMessageQueue,
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  chatTitleQueue,
  encodeRun,
  ensureAllUnbound,
  ensureChatNotBusy,
  ensureMessageInput,
  FileAttachmentService,
  failRun,
  GenerateAssistantMessage,
  GenerateChatTitle,
  Message,
  type MessageInput,
  type MessageInputInvalidError,
  MessageService,
  type Run,
  RunNotQueuedError,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import { RunRepository } from '@app-template/kernel/data'
import { Transaction } from '@app-template/packages/db'
import { type QueueError, QueueSender } from '@app-template/packages/queue'

export class CreateUserMessageUseCase extends Context.Service<
  CreateUserMessageUseCase,
  {
    /**
     * Stores the user's message with its attachments bound and the queued Run that answers it,
     * then sends its jobs: a reply's job SQS refuses fails the Run, `RunNotQueuedError`; a
     * title's is logged.
     */
    readonly create: (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) => Effect.Effect<
      Run,
      | MessageInputInvalidError
      | ChatNotFoundError
      | ChatBusyError
      | AttachmentNotFoundError
      | AttachmentBoundError
      | RunNotQueuedError
    >
  }
>()('@app-template/application/use-cases/chat/CreateUserMessageUseCase', {
  make: Effect.gen(function* () {
    const chatService = yield* ChatService
    const fileAttachments = yield* FileAttachmentService
    const messageService = yield* MessageService
    const runService = yield* RunService
    const runs = yield* RunRepository
    const queue = yield* QueueSender
    const transaction = yield* Transaction

    /** The user's message with the attachments it names bound to it; a bound one is refused first. */
    const createUserMessage = Effect.fnUntraced(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const requested = yield* fileAttachments
        .getMany({ id: input.attachmentIds, userId })
        .pipe(Effect.flatMap(ensureAllUnbound))

      // The bind follows the message, since its key to the message is not deferrable.
      const message = yield* messageService.create({ chatId, text: input.text })
      const attachments = yield* fileAttachments.bind(requested, message)
      return new Message({ ...message, attachments })
    })

    /** Fails the Run whose job SQS refused, so its message shows the failure and takes a retry. */
    const failUnsent = Effect.fnUntraced(function* (run: Run, error: QueueError) {
      const at = yield* DateTime.now
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

    const create = Effect.fn('CreateUserMessageUseCase.create')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      yield* ensureMessageInput(input)
      const chat = yield* chatService
        .getOne({ id: chatId, userId })
        .pipe(Effect.tap(ensureChatNotBusy))

      // The message, its bind and its Run commit together: a Run that loses the race keeps none.
      const run = yield* createUserMessage(userId, chatId, input).pipe(
        Effect.flatMap(runService.create),
        transaction.run,
      )

      yield* queue
        .send(assistantMessageQueue, new GenerateAssistantMessage({ chatId, runId: run.id }))
        .pipe(Effect.catchTag('QueueError', (error) => failUnsent(run, error)))
      // Every user message starts a Run, so a chat with none had no message before this one.
      if (Option.isNone(chat.run)) {
        yield* queue
          .send(chatTitleQueue, new GenerateChatTitle({ chatId, messageId: run.userMessage.id }))
          .pipe(
            Effect.catchTag('QueueError', (error) =>
              Effect.logError('chat title not queued', error),
            ),
          )
      }
      return run
    })

    return { create }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([
      ChatService.layer,
      FileAttachmentService.layer,
      MessageService.layer,
      RunService.layer,
    ]),
  )
}
