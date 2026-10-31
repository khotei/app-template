import { DateTime, Effect, Layer } from 'effect'

import { buildChat, type ChatId, ChatRepository } from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'

import { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'
import { ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryPg } from '#infrastructure/chat/message.repository'
import { UserRepositoryPg } from '#infrastructure/user/user.repository'
import { DbTest } from '#testing-e2e/db.test-layer'
import { insertUser } from '#testing-e2e/rows.test-util'

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
