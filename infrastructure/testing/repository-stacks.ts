import { DateTime, Effect, Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { buildChat, type ChatId, ChatRepository } from '@app-template/domain/chat'
import {
  buildUser,
  Credential,
  SecretHash,
  type UserId,
  UserRepository,
} from '@app-template/domain/user'

import {
  AttachmentRepositoryKv,
  AttachmentRepositoryPg,
} from '#infrastructure/attachment/attachment.repository'
import { ChatRepositoryKv, ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryKv, MessageRepositoryPg } from '#infrastructure/chat/message.repository'
import { DbTest } from '#infrastructure/testing/db-test'
import { UserRepositoryKv, UserRepositoryPg } from '#infrastructure/user/user.repository'

/** Publishes the store too, so a key-value-only test reads the keys it wrote. */
export const RepositoryStackKvMemory = Layer.mergeAll(
  UserRepositoryKv,
  ChatRepositoryKv,
  MessageRepositoryKv,
  AttachmentRepositoryKv,
).pipe(Layer.provideMerge(KeyValueStore.layerMemory))

export const RepositoryStackPgTest = Layer.mergeAll(
  UserRepositoryPg,
  ChatRepositoryPg,
  MessageRepositoryPg,
  AttachmentRepositoryPg,
).pipe(Layer.provide(DbTest))

export const repositoryStacks = [
  { name: 'the key-value store', stack: RepositoryStackKvMemory },
  { name: 'Postgres', stack: RepositoryStackPgTest },
]

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
