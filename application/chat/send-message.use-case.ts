import { Context, Effect, Layer } from 'effect'
import { SqlClient } from 'effect/sql'

import type { AttachmentBoundError, AttachmentNotFoundError } from '@app-template/domain/attachment'
import type {
  ChatBusyError,
  ChatId,
  ChatNotFoundError,
  MessageInput,
  MessageInputInvalidError,
} from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'

import { AttachmentService } from '#application/attachment/attachment.service'
import { AssistantMessageJob } from '#application/chat/assistant-message.job'
import { ChatService, type MessageDetail } from '#application/chat/chat.service'
import { ChatTitleJob } from '#application/chat/chat-title.job'
import { UserLock } from '#application/user/user-lock'

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
    const chatService = yield* ChatService
    const attachmentService = yield* AttachmentService
    const assistantJob = yield* AssistantMessageJob
    const titleJob = yield* ChatTitleJob
    const userLock = yield* UserLock
    const sql = yield* SqlClient.SqlClient

    const writeMessages = Effect.fnUntraced(
      function* (userId: UserId, chatId: ChatId, input: MessageInput) {
        const sendable = yield* chatService.findSendable(userId, chatId, input)

        const userMessage = yield* chatService.addUserMessage(sendable)
        const bound = yield* attachmentService.bind(userId, input.attachmentIds, userMessage.id)
        const assistantMessage = yield* chatService.addAssistantMessage(sendable)
        yield* chatService.touch(sendable)

        return { sendable, userMessage, bound, assistantMessage }
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    const send = Effect.fn('SendMessageUseCase.send')(function* (
      userId: UserId,
      chatId: ChatId,
      input: MessageInput,
    ) {
      const { sendable, userMessage, bound, assistantMessage } = yield* writeMessages(
        userId,
        chatId,
        input,
      )

      yield* assistantJob.enqueue(assistantMessage)
      if (sendable.opensChat) yield* titleJob.enqueue(userMessage)

      return {
        userMessage: { message: userMessage, attachments: bound },
        assistantMessage: { message: assistantMessage, attachments: [] },
      }
    }, userLock.withPermit)

    return { send }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([
      ChatService.layer,
      AttachmentService.layer,
      AssistantMessageJob.layer,
      ChatTitleJob.layer,
      UserLock.layer,
    ]),
  )
}
