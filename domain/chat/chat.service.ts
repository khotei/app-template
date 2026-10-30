import { Array as Arr, Context, DateTime, Effect, Layer, Option, Struct, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { AttachmentBucket, AttachmentRepository } from '#domain/attachment/attachment.port'
import { ChatNotFoundError } from '#domain/chat/chat.error'
import { Chat, type ChatTitle } from '#domain/chat/chat.model'
import { ChatRepository, type ChatWhere } from '#domain/chat/chat.port'

/** The chat a rename finds: by its owner, or only while it is still untitled. */
export type ChatRenameWhere = Types.Simplify<
  Pick<Chat, 'id'> & RequireAtLeastOne<Pick<Chat, 'userId' | 'title'>>
>

/** The user's chat a delete finds. */
export type ChatDeleteWhere = Pick<Chat, 'id' | 'userId'>

export class ChatService extends Context.Service<
  ChatService,
  {
    readonly getOne: (where: ChatWhere) => Effect.Effect<Chat, ChatNotFoundError>
    /** Titles the chat `where` finds and moves its `updatedAt`. */
    readonly rename: (
      where: ChatRenameWhere,
      title: ChatTitle,
    ) => Effect.Effect<Chat, ChatNotFoundError>
    /** Removes the user's chat with its messages, their attachments and the bytes. */
    readonly delete: (where: ChatDeleteWhere) => Effect.Effect<void, ChatNotFoundError>
  }
>()('@app-template/domain/chat/ChatService', {
  make: Effect.gen(function* () {
    const chats = yield* ChatRepository
    const attachments = yield* AttachmentRepository
    const bucket = yield* AttachmentBucket

    const getOne = Effect.fn('ChatService.getOne')((where: ChatWhere) =>
      chats
        .selectOne(where)
        .pipe(Effect.flatMap(Effect.fromOption(() => new ChatNotFoundError({ id: where.id })))),
    )

    const rename = Effect.fn('ChatService.rename')(function* (
      where: ChatRenameWhere,
      title: ChatTitle,
    ) {
      const chat = yield* getOne(where)
      const updatedAt = yield* DateTime.now
      const set = { title: Option.some(title), updatedAt }

      // The `where` holds again in the write, so a change landing after the read is kept.
      yield* chats.update(set, where)
      return new Chat({ ...chat, ...set })
    })

    const remove = Effect.fn('ChatService.delete')(function* (where: ChatDeleteWhere) {
      yield* getOne(where)
      // The one delete takes the messages and their attachments by the cascade, but it answers
      // only the chat's row: the attachments are read first for the ids of their bytes.
      const removed = yield* attachments.selectMany({ chatId: where.id, userId: where.userId })

      yield* chats.delete({ id: where.id })
      yield* bucket.deleteMany(Arr.map(removed, Struct.get('id')))
    })

    return { getOne, rename, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
