import { DateTime, Effect, Layer } from 'effect'

import { buildChat, type ChatId, ChatRepository } from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'

import { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'
import { ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryPg } from '#infrastructure/chat/message.repository'
import { DbTest } from '#infrastructure/db/testing/db.test-layer'
import { insertUser } from '#infrastructure/testing/rows.test-util'
import { UserRepositoryPg } from '#infrastructure/user/user.repository'

export const RepositoryStackPgTest = Layer.mergeAll(
  UserRepositoryPg,
  ChatRepositoryPg,
  MessageRepositoryPg,
  AttachmentRepositoryPg,
).pipe(Layer.provideMerge(DbTest))

export const insertOwnedChats = (userId: UserId, chatIds: ReadonlyArray<ChatId>) =>
  Effect.gen(function* () {
    const chats = yield* ChatRepository

    yield* insertUser(userId)
    yield* Effect.forEach(
      chatIds,
      (id) => chats.insert(buildChat({ id, userId, createdAt: DateTime.makeUnsafe(0) })),
      { discard: true },
    )
  })
