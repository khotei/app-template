import { Context, Effect, Layer, Option } from 'effect'

import {
  type AttachmentBoundError,
  type AttachmentNotFoundError,
  type ChatBusyError,
  type ChatId,
  type ChatNotFoundError,
  ChatService,
  ensureAllUnbound,
  ensureChatNotBusy,
  ensureMessageInput,
  FileAttachmentService,
  Message,
  type MessageInput,
  type MessageInputInvalidError,
  MessageService,
  type Run,
  type RunNotQueuedError,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import { Transaction } from '@app-template/packages/db'

import { AssistantMessageSender, ChatTitleSender } from '#use-cases/chat/chat.sender'

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
    const fileAttachments = yield* FileAttachmentService
    const messageService = yield* MessageService
    const runService = yield* RunService
    const replySender = yield* AssistantMessageSender
    const titleSender = yield* ChatTitleSender
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

      yield* replySender.send(run)
      // Every user message starts a Run, so a chat with none had no message before this one.
      if (Option.isNone(chat.run)) {
        yield* titleSender.send(run.userMessage)
      }
      return run
    })

    return { create }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([
      AssistantMessageSender.layer,
      ChatService.layer,
      ChatTitleSender.layer,
      FileAttachmentService.layer,
      MessageService.layer,
      RunService.layer,
    ]),
  )
}
