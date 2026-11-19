import { Context, Crypto, DateTime, Effect, Layer, Option, Redacted, Schema } from 'effect'
import { Base64Url, Hex } from 'effect/encoding'

import { UserRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith, idGenerator } from '@app-template/packages/schema'

import { UserId } from '#identity/contract/user.id'
import { UserUnknownError } from '#identity/domain/user.error'
import { SecretHash, secretBytes, User, type UserSecret } from '#identity/domain/user.model'

const encoder = new TextEncoder()

export class UserService extends Context.Service<
  UserService,
  {
    /** Returns the user a valid secret names; any other input creates a user with a new secret. */
    readonly ensure: (
      secret: Option.Option<UserSecret>,
    ) => Effect.Effect<{ readonly user: User; readonly secret: UserSecret }>
    readonly authenticate: (secret: UserSecret) => Effect.Effect<User, UserUnknownError>
  }
>()('@app-template/application/identity/services/UserService', {
  make: Effect.gen(function* () {
    const users = yield* UserRepository
    const crypto = yield* Crypto.Crypto
    const generateId = yield* idGenerator

    const hashSecret = Effect.fnUntraced(function* (secret: UserSecret) {
      const digest = yield* crypto.digest('SHA-256', encoder.encode(Redacted.value(secret)))
      return { kind: 'secret', hash: SecretHash.make(Hex.encode(digest)) } as const
    }, Effect.orDie)

    const authenticate = Effect.fn('UserService.authenticate')((secret: UserSecret) =>
      hashSecret(secret).pipe(
        Effect.flatMap((credential) => users.selectOne({ credential })),
        Effect.flatMap(decodeWith(Schema.Option(User))),
        Effect.flatMap(Effect.fromOption(() => new UserUnknownError())),
      ),
    )

    const registerUser = Effect.fnUntraced(function* () {
      const id = yield* generateId(UserId)
      const createdAt = yield* DateTime.now
      const bytes = yield* crypto.randomBytes(secretBytes).pipe(Effect.orDie)
      const secret = Redacted.make(Base64Url.encode(bytes))

      const user = new User({ id, createdAt })
      const credential = yield* hashSecret(secret)
      const row = yield* encodeWith(User)(user)
      yield* users.insert(row, credential)
      return { user, secret }
    })

    const ensure = Effect.fn('UserService.ensure')((secret: Option.Option<UserSecret>) =>
      Option.match(secret, {
        onNone: registerUser,
        onSome: (presented) =>
          authenticate(presented).pipe(
            Effect.map((user) => ({ user, secret: presented })),
            Effect.catchTag('UserUnknownError', registerUser),
          ),
      }),
    )

    return { ensure, authenticate }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
