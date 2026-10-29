import { Array as Arr, Context, Effect, Layer } from 'effect'

import { AttachmentService } from '@app-template/domain/attachment'
import {
  type ChatId,
  type ChatNotFoundError,
  ChatRepository,
  ChatService,
  MessageRepository,
} from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'
import { Transaction } from '@app-template/infrastructure/db'

export class DeleteChatUseCase extends Context.Service<
  DeleteChatUseCase,
  {
    /** Removes the chat with its messages and their attachments, whether or not a reply runs. */
    readonly delete: (userId: UserId, chatId: ChatId) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/application/chat/DeleteChatUseCase', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const chatService = yield* ChatService
    const messages = yield* MessageRepository
    const attachmentService = yield* AttachmentService
    const transaction = yield* Transaction

    // The cascade from the chat cannot reach the attachments' bytes.
    const remove = Effect.fn('DeleteChatUseCase.delete')(function* (
      userId: UserId,
      chatId: ChatId,
    ) {
      yield* chatService.findOne({ id: chatId, userId })
      const details = yield* messages.selectMany({ chatId: [chatId] })

      yield* attachmentService.deleteByIds(
        Arr.flatMap(details, ({ attachments }) => Arr.map(attachments, ({ id }) => id)),
      )
      yield* chats.delete(chatId)
    }, transaction.run)

    return { delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([ChatService.layer, AttachmentService.layer]),
  )
}
