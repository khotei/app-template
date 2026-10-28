import { Array as Arr, Context, Effect, Layer } from 'effect'
import { SqlClient } from 'effect/sql'

import { AttachmentService } from '@app-template/domain/attachment'
import { type ChatId, type ChatNotFoundError, ChatService } from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'

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
    const sql = yield* SqlClient.SqlClient

    // The cascade from the chat cannot reach the attachments' bytes.
    const remove = Effect.fn('DeleteChatUseCase.delete')(
      function* (userId: UserId, chatId: ChatId) {
        const { messages } = yield* chatService.get(userId, chatId)
        yield* attachmentService.deleteByIds(
          Arr.flatMap(messages, ({ attachments }) => Arr.map(attachments, ({ id }) => id)),
        )
        yield* chatService.delete(userId, chatId)
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    return { delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([ChatService.layer, AttachmentService.layer]),
  )
}
