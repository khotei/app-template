import { Context, Effect, Layer, Redacted } from 'effect'
import { Digest, SecureRandom } from 'effect/crypto'
import { Base64Url } from 'effect/encoding'

import {
  encodeWhere,
  type UserEntity,
  type UserEntityCredential,
  UserRepository,
} from '@app-template/kernel/data'
import { Transaction } from '@app-template/packages/db'

import { secretBytes, User, type UserSecret, UserUnknownError } from '#identity/domain/user.model'

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
    const transaction = yield* Transaction

    const hashSecret = Effect.fnUntraced(function* (secret: UserSecret) {
      const hash = yield* digest.digestHex(Digest.sha256, encoder.encode(Redacted.value(secret)))
      return { kind: 'secret', hash } as const
    })

    const authenticate = Effect.fn('UserService.authenticate')(
      hashSecret,
      Effect.flatMap((credentials) => users.selectOne(encodeWhere({ credentials }))),
      Effect.flatMap(User.decodeOne),
      Effect.flatMap(Effect.fromOption(() => new UserUnknownError())),
    )

    // The user and its credential commit together: a user is never stored without its secret.
    const createUser = Effect.fnUntraced(function* (
      user: UserEntity,
      credential: UserEntityCredential,
    ) {
      yield* users.insert(user)
      yield* users.insertCredential({ ...credential, userId: user.id })
    }, transaction.run)

    const register = Effect.fnUntraced(function* () {
      const bytes = yield* random.randomBytes(secretBytes)
      const fresh = Redacted.make(Base64Url.encode(bytes))

      const { set, row } = yield* User.makeInsert({})
      const credential = yield* hashSecret(fresh)
      yield* createUser(row, credential)
      return { user: new User(set), secret: fresh }
    })

    const recognise = Effect.fn('UserService.recognise')(
      function* (secret: UserSecret) {
        const user = yield* authenticate(secret)
        return { user, secret }
      },
      Effect.catchTag('UserUnknownError', () => register()),
    )

    return { recognise, authenticate }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
