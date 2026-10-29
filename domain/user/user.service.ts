import { Context, Crypto, DateTime, Effect, Layer, Option, Redacted } from 'effect'
import { Base64Url, Hex } from 'effect/encoding'

import { UserUnknownError } from '#domain/user/user.error'
import { UserId } from '#domain/user/user.id'
import { buildUser, Credential, SecretHash, type User } from '#domain/user/user.model'
import { UserRepository } from '#domain/user/user.port'

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
>()('@app-template/domain/user/UserService', {
  make: Effect.gen(function* () {
    const users = yield* UserRepository
    const crypto = yield* Crypto.Crypto
    const randomUserId = crypto.randomUUIDv7().pipe(Effect.orDie, Effect.map(UserId.make))

    const hashSecret = Effect.fnUntraced(function* (secret: UserSecret) {
      const digest = yield* crypto.digest('SHA-256', encoder.encode(Redacted.value(secret)))
      return new Credential({ kind: 'secret', hash: SecretHash.make(Hex.encode(digest)) })
    }, Effect.orDie)

    const authenticate = Effect.fn('UserService.authenticate')((secret: UserSecret) =>
      hashSecret(secret).pipe(
        Effect.flatMap(users.selectByCredential),
        Effect.flatMap(Effect.fromOption(() => new UserUnknownError())),
      ),
    )

    const registerUser = Effect.fnUntraced(function* () {
      const id = yield* randomUserId
      const createdAt = yield* DateTime.now
      const bytes = yield* Effect.orDie(crypto.randomBytes(secretBytes))
      const secret = Redacted.make(Base64Url.encode(bytes))

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
