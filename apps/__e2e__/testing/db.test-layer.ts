import { Effect, Layer } from 'effect'

import { owner, stranger } from '@app-template/domain/testing'
import { buildUser, Credential, SecretHash, UserRepository } from '@app-template/identity/domain'
import type { UserId } from '@app-template/identity-contract'
import { UserPg } from '@app-template/infrastructure/user'
import { DbTest } from '@app-template/kernel/testing-e2e'
import { epoch } from '@app-template/testing'

/** Gives each user a credential of its own, since a credential's hash is a primary key. */
const insertUser = (id: UserId) =>
  UserRepository.use((users) =>
    users.insert(
      buildUser({ id, createdAt: epoch }),
      new Credential({ kind: 'secret', hash: SecretHash.make(id.replaceAll('-', '').repeat(2)) }),
    ),
  )

/** `DbTest` where `owner` and `stranger` exist, so their rows can refer to them. */
export const DbWithUsersTest = Layer.effectDiscard(
  Effect.forEach([owner, stranger], insertUser, { discard: true }),
).pipe(Layer.provideMerge(UserPg), Layer.provideMerge(DbTest))
