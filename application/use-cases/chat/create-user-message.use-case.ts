import { Context, Effect, Layer } from 'effect'

import {
  type Attachment,
  type AttachmentBoundError,
  type AttachmentNotFoundError,
  AttachmentService,
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  chatTitleQueue,
  ensureAllReachableFrom,
  ensureAllUnbound,
  ensureChatNotBusy,
  ensureMessageInput,
  GenerateChatTitle,
  isNewChat,
  type MessageInput,
  type MessageInputInvalidError,
  MessageService,
  type Run,
  type RunNotQueuedError,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import { Transaction } from '@app-template/packages/db'
import { QueueSender } from '@app-template/packages/queue'

import { AssistantMessageSender } from '#use-cases/chat/chat.sender'

export class CreateUserMessageUseCase extends Context.Service<
  CreateUserMessageUseCase,
  {
    /**
     * Stores the user's message with its attachments bound and the queued Run that answers it,
     * then sends its jobs.
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
    const attachments = yield* AttachmentService
    const messageService = yield* MessageService
    const runService = yield* RunService
    const replySender = yield* AssistantMessageSender
    const queue = yield* QueueSender
    const transaction = yield* Transaction

    /** The user's message with `requested` bound to it. */
    const createUserMessage = Effect.fnUntraced(function* (
      chatId: ChatId,
      input: MessageInput,
      requested: ReadonlyArray<Attachment>,
    ) {
      // The bind follows the message, since its key to the message is not deferrable.
      const message = yield* messageService.create({ chatId, text: input.text })
      yield* attachments.bind(requested, message)
      return message
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
      // Read before the transaction, so its S3 heads run outside it; the bind's write dies on one
      // a send bound since.
      const requested = yield* attachments
        .getMany({ id: input.attachmentIds, userId })
        .pipe(Effect.flatMap(ensureAllReachableFrom(chatId)), Effect.flatMap(ensureAllUnbound))

      // The message, its bind and its Run commit together: a Run that loses the race keeps none.
      const run = yield* createUserMessage(chatId, input, requested).pipe(
        Effect.flatMap(runService.create),
        transaction.run,
      )

      // The title job goes first: a reply job SQS refuses fails the create, and no retry sends a
      // title.
      if (isNewChat(chat)) {
        const messageId = run.userMessageId
        yield* queue
          .send(chatTitleQueue, new GenerateChatTitle({ messageId }))
          .pipe(
            Effect.ignore({ log: 'Error', message: 'chat title not queued' }),
            Effect.annotateLogs({ chatId, messageId }),
          )
      }
      yield* replySender.send(run)
      return run
    })

    return { create }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([
      AssistantMessageSender.layer,
      AttachmentService.layer,
      ChatService.layer,
      MessageService.layer,
      RunService.layer,
    ]),
  )
}
