import { Context, Effect, Layer } from 'effect'

import {
  type AttachmentBoundError,
  type AttachmentNotFoundError,
  AttachmentService,
} from '@app-template/domain/attachment'
import {
  type ChatBusyError,
  type ChatId,
  ChatNotFoundError,
  ChatRepository,
  ChatService,
  type MessageDetail,
  type MessageInput,
  type MessageInputInvalidError,
  MessageService,
} from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'
import { chatTitleQueue, GenerateChatTitle } from '@app-template/infrastructure/chat'
import { Transaction } from '@app-template/infrastructure/db'
import { QueueClient } from '@app-template/queue'

import { AssistantMessageJob } from '#application/chat/assistant-message.job'

export interface SentMessages {
  readonly userMessage: MessageDetail
  readonly assistantMessage: MessageDetail
}

export class SendMessageUseCase extends Context.Service<
  SendMessageUseCase,
  {
    /** Stores the user's message with a queued reply, binds its attachments and queues the jobs. */
    readonly send: (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) => Effect.Effect<
      SentMessages,
      | MessageInputInvalidError
      | ChatNotFoundError
      | ChatBusyError
      | AttachmentNotFoundError
      | AttachmentBoundError
    >
  }
>()('@app-template/application/chat/SendMessageUseCase', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const chatService = yield* ChatService
    const messageService = yield* MessageService
    const attachmentService = yield* AttachmentService
    const assistantJob = yield* AssistantMessageJob
    const queue = yield* QueueClient
    const transaction = yield* Transaction

    const send = Effect.fn('SendMessageUseCase.send')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const sendable = yield* chatService.findSendable(userId, chatId, input)

      // A rule-free write, before the messages: a chat deleted since the check reads as gone.
      const touched = yield* chats.update({ updatedAt: sendable.at }, { id: chatId })
      if (!touched) return yield* new ChatNotFoundError({ id: chatId })

      const userMessage = yield* messageService.addUserMessage(sendable)
      const bound = yield* attachmentService.bind(userId, input.attachmentIds, userMessage.id)
      const assistantMessage = yield* messageService.addAssistantMessage(sendable)
      yield* assistantJob.enqueue(assistantMessage)
      if (sendable.opensChat) {
        const titleJob = new GenerateChatTitle({ chatId, messageId: userMessage.id })
        yield* Effect.orDie(queue.send(chatTitleQueue, titleJob))
      }

      return {
        userMessage: { message: userMessage, attachments: bound },
        assistantMessage: { message: assistantMessage, attachments: [] },
      }
    }, transaction.run)

    return { send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([
      ChatService.layer,
      MessageService.layer,
      AttachmentService.layer,
      AssistantMessageJob.layer,
    ]),
  )
}
