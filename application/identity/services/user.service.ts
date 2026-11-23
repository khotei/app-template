import { Context, Effect, Layer, Redacted, SchemaIssue } from 'effect'
import { Digest, SecureRandom } from 'effect/crypto'
import { Base64Url } from 'effect/encoding'

import { UserUnknownError } from '#identity/domain/user.error'
import { secretBytes, User, type UserSecret } from '#identity/domain/user.model'
import { UserRepository } from '#identity/services/user.repository'

const encoder = new TextEncoder()

export class UserService extends Context.Service<
  UserService,
  {
    /**
     * Recognises the user a valid secret names; any other secret registers a new user with a new
     * secret.
     */
    readonly recognise: (
      secret: UserSecret,
    ) => Effect.Effect<{ readonly user: User; readonly secret: UserSecret }>
    readonly authenticate: (secret: UserSecret) => Effect.Effect<User, UserUnknownError>
  }
>()('@app-template/application/identity/services/UserService', {
  make: Effect.gen(function* () {
    const users = yield* UserRepository
    const digest = yield* Digest.Digest
    const random = yield* SecureRandom.SecureRandom

    const hashSecret = Effect.fnUntraced(function* (secret: UserSecret) {
      const hash = yield* digest.digestHex(Digest.sha256, encoder.encode(Redacted.value(secret)))
      return { kind: 'secret', hash } as const
    })

    const authenticate = Effect.fn('UserService.authenticate')(
      hashSecret,
      Effect.flatMap(users.selectOne),
      Effect.flatMap(Effect.fromOption(() => new UserUnknownError())),
    )

    const register = Effect.gen(function* () {
      const bytes = yield* random.randomBytes(secretBytes)
      const fresh = Redacted.make(Base64Url.encode(bytes))

      const row = yield* User.insert.makeEffect({})
      const credential = yield* hashSecret(fresh)
      yield* users.insert(row, credential)
      return { user: new User(row), secret: fresh }
    }).pipe(Effect.catchIf(SchemaIssue.isIssue, Effect.die))

    const recognise = Effect.fn('UserService.recognise')(
      function* (secret: UserSecret) {
        const user = yield* authenticate(secret)
        return { user, secret }
      },
      Effect.catchTag('UserUnknownError', () => register),
    )

    return { recognise, authenticate }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
