import { Context, Effect, Layer, Option } from 'effect'

import {
  type AttachmentBoundError,
  type AttachmentNotFoundError,
  assistantMessageQueue,
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  chatTitleQueue,
  ensureAllUnbound,
  ensureChatNotBusy,
  ensureMessageInput,
  FileAttachmentService,
  GenerateAssistantMessage,
  GenerateChatTitle,
  Message,
  type MessageInput,
  type MessageInputInvalidError,
  MessageService,
  type Run,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import { Transaction } from '@app-template/packages/db'
import { QueueSender } from '@app-template/packages/queue'

export class CreateUserMessageUseCase extends Context.Service<
  CreateUserMessageUseCase,
  {
    /**
     * Stores the user's message with its attachments bound and the queued Run that answers it,
     * then sends its jobs; a send SQS refuses dies, leaving the Run queued.
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
    >
  }
>()('@app-template/application/use-cases/chat/CreateUserMessageUseCase', {
  make: Effect.gen(function* () {
    const chatService = yield* ChatService
    const fileAttachments = yield* FileAttachmentService
    const messageService = yield* MessageService
    const runService = yield* RunService
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
        .pipe(Effect.orDie)
      // Every user message starts a Run, so a chat with none had no message before this one.
      if (Option.isNone(chat.run)) {
        yield* queue
          .send(chatTitleQueue, new GenerateChatTitle({ chatId, messageId: run.userMessage.id }))
          .pipe(Effect.orDie)
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
