import { Context, Crypto, DateTime, Effect, Layer, Option, Redacted } from 'effect'
import { Base64Url, Hex } from 'effect/encoding'

import {
  buildUser,
  Credential,
  SecretHash,
  type User,
  UserId,
  UserRepository,
  UserUnknownError,
} from '@app-template/domain/user'

/** The 32 random bytes a user signs in with, as base64url; only its hash is stored. */
export type UserSecret = Redacted.Redacted<string>

const secretBytes = 32

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
>()('@app-template/application/user/UserService', {
  make: Effect.gen(function* () {
    const users = yield* UserRepository
    const crypto = yield* Crypto.Crypto

    const hashSecret = Effect.fnUntraced(function* (secret: UserSecret) {
      const digest = yield* crypto.digest('SHA-256', encoder.encode(Redacted.value(secret)))
      return new Credential({ kind: 'secret', hash: SecretHash.make(Hex.encode(digest)) })
    }, Effect.orDie)

    const authenticate = Effect.fn('UserService.authenticate')(function* (secret: UserSecret) {
      const credential = yield* hashSecret(secret)
      const user = yield* users.selectByCredential(credential)
      if (Option.isNone(user)) return yield* new UserUnknownError()
      return user.value
    })

    const registerUser = Effect.fnUntraced(function* () {
      const id = UserId.make(yield* Effect.orDie(crypto.randomUUIDv7()))
      const createdAt = yield* DateTime.now
      const secret = Redacted.make(
        Base64Url.encode(yield* Effect.orDie(crypto.randomBytes(secretBytes))),
      )
      const user = buildUser({ id, createdAt })
      const credential = yield* hashSecret(secret)
      yield* users.insert(user, credential)
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
