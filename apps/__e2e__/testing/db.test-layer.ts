import { Effect, Layer } from 'effect'

import { owner, stranger } from '@app-template/application/chat/testing'
import type { UserId } from '@app-template/application/identity'
import { UserRepository } from '@app-template/kernel/data'
import { DbTest } from '@app-template/kernel/data/testing/e2e'

/** Gives each user a credential of its own, since a credential's hash is a primary key. */
const insertUser = (id: UserId) =>
  UserRepository.use((users) =>
    users.insert(
      { id, createdAt: new Date(0) },
      { kind: 'secret', hash: id.replaceAll('-', '').repeat(2) },
    ),
  )

/** `DbTest` where `owner` and `stranger` exist, so their rows can refer to them. */
export const DbWithUsersTest = Layer.effectDiscard(
  Effect.forEach([owner, stranger], insertUser, { discard: true }),
).pipe(Layer.provide(UserRepository.layer), Layer.provideMerge(DbTest))
