import { Array as Arr, Context, Effect, Layer } from 'effect'

import type { ChatId, ChatNotFoundError } from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'

import { AttachmentService } from '#application/attachment/attachment.service'
import { ChatService } from '#application/chat/chat.service'
import { UserLock } from '#application/user/user-lock'

export class DeleteChatUseCase extends Context.Service<
  DeleteChatUseCase,
  {
    /** Removes the chat with its messages and their attachments, whether or not a reply runs. */
    readonly delete: (userId: UserId, chatId: ChatId) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/application/chat/DeleteChatUseCase', {
  make: Effect.gen(function* () {
    const chatService = yield* ChatService
    const attachmentService = yield* AttachmentService
    const userLock = yield* UserLock

    // Each step leaves what the next one reads, so a retry after a crash finishes the cascade:
    // the attachments go while the messages still list them.
    const deleteChat = Effect.fn('DeleteChatUseCase.delete')(function* (
      userId: UserId,
      chatId: ChatId,
    ) {
      const { messages } = yield* chatService.get(userId, chatId)
      yield* attachmentService.deleteByIds(
        Arr.flatMap(messages, ({ message }) => message.attachmentIds),
      )
      yield* chatService.delete(userId, chatId)
    }, userLock.withPermit)

    return { delete: deleteChat }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([ChatService.layer, AttachmentService.layer, UserLock.layer]),
  )
}
