import { Context, DateTime, Effect, Layer, Redacted, Schema } from 'effect'
import { Digest, SecureRandom } from 'effect/crypto'
import { Base64Url } from 'effect/encoding'

import { UserRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith, idGenerator } from '@app-template/packages/schema'

import { UserId } from '#identity/contract/user.util'
import { UserUnknownError } from '#identity/domain/user.error'
import { secretBytes, User, type UserSecret } from '#identity/domain/user.model'

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
    const generateId = yield* idGenerator

    const hashSecret = Effect.fnUntraced(function* (secret: UserSecret) {
      const hash = yield* digest.digestHex(Digest.sha256, encoder.encode(Redacted.value(secret)))
      return { kind: 'secret', hash } as const
    })

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
      const bytes = yield* random.randomBytes(secretBytes)
      const secret = Redacted.make(Base64Url.encode(bytes))

      const user = new User({ id, createdAt })
      const credential = yield* hashSecret(secret)
      const row = yield* encodeWith(User)(user)
      yield* users.insert(row, credential)
      return { user, secret }
    })

    const recognise = Effect.fn('UserService.recognise')((secret: UserSecret) =>
      authenticate(secret).pipe(
        Effect.map((user) => ({ user, secret })),
        Effect.catchTag('UserUnknownError', registerUser),
      ),
    )

    return { recognise, authenticate }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
