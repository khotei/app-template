import { DateTime, Effect, Layer } from 'effect'

import { buildChat, type ChatId, ChatRepository } from '@app-template/domain/chat'
import {
  buildUser,
  Credential,
  SecretHash,
  type UserId,
  UserRepository,
} from '@app-template/domain/user'

import { AttachmentRepositoryPg } from '#infrastructure/attachment/attachment.repository'
import { ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryPg } from '#infrastructure/chat/message.repository'
import { DbTest } from '#infrastructure/testing/db-test'
import { UserRepositoryPg } from '#infrastructure/user/user.repository'

export const RepositoryStackPgTest = Layer.mergeAll(
  UserRepositoryPg,
  ChatRepositoryPg,
  MessageRepositoryPg,
  AttachmentRepositoryPg,
).pipe(Layer.provide(DbTest))

const parentCreatedAt = DateTime.makeUnsafe(0)

/** Gives each user a credential of its own, since a credential's hash is a primary key. */
export const insertOwner = (id: UserId) =>
  Effect.flatMap(UserRepository, (users) =>
    users.insert(
      buildUser({ id, createdAt: parentCreatedAt }),
      new Credential({ kind: 'secret', hash: SecretHash.make(id.replaceAll('-', '').repeat(2)) }),
    ),
  )

export const insertOwnedChats = (userId: UserId, chatIds: ReadonlyArray<ChatId>) =>
  Effect.gen(function* () {
    const chats = yield* ChatRepository

    yield* insertOwner(userId)
    yield* Effect.forEach(
      chatIds,
      (id) => chats.insert(buildChat({ id, userId, createdAt: parentCreatedAt })),
      { discard: true },
    )
  })
