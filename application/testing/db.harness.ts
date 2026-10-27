import { Effect, Layer } from 'effect'

import {
  buildUser,
  Credential,
  SecretHash,
  type UserId,
  UserRepository,
} from '@app-template/domain/user'
import { Db } from '@app-template/infrastructure/db'
import { UserPg } from '@app-template/infrastructure/user'
import { PgClientTest } from '@app-template/testing'

import { epoch } from '#application/testing/chat.fixture'
import { owner, stranger } from '#application/testing/user.fixture'

/** Gives each user a credential of its own, since a credential's hash is a primary key. */
const insertUser = (id: UserId) =>
  Effect.flatMap(UserRepository, (users) =>
    users.insert(
      buildUser({ id, createdAt: epoch }),
      new Credential({ kind: 'secret', hash: SecretHash.make(id.replaceAll('-', '').repeat(2)) }),
    ),
  )

/** `Db` on a fresh test database, dropped when the test ends. */
export const DbTest = Db.layer.pipe(Layer.provideMerge(PgClientTest))

/** `DbTest` where `owner` and `stranger` exist, so their rows can refer to them. */
export const DbWithUsers = Layer.effectDiscard(
  Effect.forEach([owner, stranger], insertUser, { discard: true }),
).pipe(Layer.provideMerge(UserPg), Layer.provideMerge(DbTest))
