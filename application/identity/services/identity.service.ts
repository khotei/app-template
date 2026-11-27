import { Context, Effect, Layer, Redacted } from 'effect'
import { Digest, SecureRandom } from 'effect/crypto'
import { Base64Url } from 'effect/encoding'

import { User } from '@app-template/application/user'
import {
  encodeWhere,
  type UserEntity,
  type UserEntityCredential,
  UserRepository,
} from '@app-template/kernel/data'
import { Transaction } from '@app-template/packages/db'
import { RowCodec } from '@app-template/packages/schema'

import {
  IdentityUnknownError,
  randomBytesPerSecret,
  type UserSecret,
} from '#identity/domain/identity.model'
import { UserSecretBytes } from '#identity/domain/user-secret-bytes'

export class IdentityService extends Context.Service<
  IdentityService,
  {
    /**
     * Recognises the user a valid secret names; any other secret registers a new user with a new
     * secret.
     */
    readonly recognise: (
      secret: UserSecret,
    ) => Effect.Effect<{ readonly user: User; readonly secret: UserSecret }>
    readonly authenticate: (secret: UserSecret) => Effect.Effect<User, IdentityUnknownError>
  }
>()('@app-template/application/identity/services/IdentityService', {
  make: Effect.gen(function* () {
    const users = yield* UserRepository
    const digest = yield* Digest.Digest
    const random = yield* SecureRandom.SecureRandom
    const transaction = yield* Transaction

    const hashSecret = Effect.fnUntraced(function* (secret: UserSecret) {
      const hash = yield* digest.digestHex(Digest.sha256, UserSecretBytes.build(secret))
      return { kind: 'secret', hash } as const
    })

    const authenticate = Effect.fn('IdentityService.authenticate')(
      hashSecret,
      Effect.flatMap((credentials) => users.selectOne(encodeWhere({ credentials }))),
      Effect.flatMap(RowCodec.decodeOne(User)),
      Effect.flatMap(Effect.fromOption(() => new IdentityUnknownError())),
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
      const bytes = yield* random.randomBytes(randomBytesPerSecret)
      const fresh = Redacted.make(Base64Url.encode(bytes))

      const { set, row } = yield* RowCodec.makeInsert(User)({})
      const credential = yield* hashSecret(fresh)
      yield* createUser(row, credential)
      return { user: new User(set), secret: fresh }
    })

    const recognise = Effect.fn('IdentityService.recognise')(
      function* (secret: UserSecret) {
        const user = yield* authenticate(secret)
        return { user, secret }
      },
      Effect.catchTag('IdentityUnknownError', () => register()),
    )

    return { recognise, authenticate }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
