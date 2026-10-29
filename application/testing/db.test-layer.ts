import { Effect, Layer } from 'effect'

import { epoch, owner, stranger } from '@app-template/domain/testing'
import {
  buildUser,
  Credential,
  SecretHash,
  type UserId,
  UserRepository,
} from '@app-template/domain/user'
import { DbTest } from '@app-template/infrastructure/testing'
import { UserPg } from '@app-template/infrastructure/user'

/** Gives each user a credential of its own, since a credential's hash is a primary key. */
const insertUser = (id: UserId) =>
  Effect.flatMap(UserRepository, (users) =>
    users.insert(
      buildUser({ id, createdAt: epoch }),
      new Credential({ kind: 'secret', hash: SecretHash.make(id.replaceAll('-', '').repeat(2)) }),
    ),
  )

/** `DbTest` where `owner` and `stranger` exist, so their rows can refer to them. */
export const DbWithUsersTest = Layer.effectDiscard(
  Effect.forEach([owner, stranger], insertUser, { discard: true }),
).pipe(Layer.provideMerge(UserPg), Layer.provideMerge(DbTest))
