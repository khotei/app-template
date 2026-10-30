import { Array as Arr, Context, Effect, Layer, Struct } from 'effect'

import { AttachmentBucket, AttachmentRepository } from '#domain/attachment/attachment.port'
import { ChatNotFoundError } from '#domain/chat/chat.error'
import type { ChatId } from '#domain/chat/chat.id'
import { Chat } from '#domain/chat/chat.model'
import { ChatRepository, type ChatSet, type ChatWhere } from '#domain/chat/chat.port'
import type { UserId } from '#domain/user/user.id'

export class ChatService extends Context.Service<
  ChatService,
  {
    /**
     * With `forUpdate`, holds the chat's row until the transaction ends; its status is read after
     * the lock, so it counts a reply a concurrent send committed while this read waited.
     */
    readonly getOne: (
      where: ChatWhere,
      options?: { readonly forUpdate?: boolean },
    ) => Effect.Effect<Chat, ChatNotFoundError>
    /** Writes `set` to the chat `where` finds; the caller decides the title and whether `updatedAt` moves. */
    readonly rename: (where: ChatWhere, set: ChatSet) => Effect.Effect<Chat, ChatNotFoundError>
    /** Removes the user's chat with its messages, their attachments and the bytes. */
    readonly delete: (userId: UserId, chatId: ChatId) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/domain/chat/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const attachments = yield* AttachmentRepository
    const bucket = yield* AttachmentBucket

    const getOne = Effect.fn('ChatService.getOne')(function* (
      where: ChatWhere,
      options?: { readonly forUpdate?: boolean },
    ) {
      return yield* chats
        .selectOne(where, options)
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: where.id }))))
    })

    const rename = Effect.fn('ChatService.rename')(function* (where: ChatWhere, set: ChatSet) {
      const chat = yield* getOne(where)
      // The `where` holds again in the write, so a change landing after the read is kept.
      yield* chats.update(set, where)
      return new Chat({ ...chat, ...set })
    })

    const remove = Effect.fn('ChatService.delete')(function* (userId: UserId, chatId: ChatId) {
      yield* getOne({ id: chatId, userId })
      // The one delete takes the messages and their attachments by the cascade, but it answers
      // only the chat's row: the attachments are read first for the ids of their bytes.
      const removed = yield* attachments.selectMany({ chatId, userId })

      yield* chats.delete({ id: chatId })
      yield* bucket.deleteMany(Arr.map(removed, Struct.get('id')))
    })

    return { getOne, rename, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
