import { Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { type Credential, User, UserId, UserRepository } from '@app-template/domain/user'

import { createCollection } from '#infrastructure/kv/kv-collection'

const credentialKey = (credential: Credential) => `${credential.kind}/${credential.hash}`

export const UserRepositoryKv = Layer.effect(
  UserRepository,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const users = createCollection(store, { prefix: 'users/', schema: User })
    const credentials = createCollection(store, { prefix: 'credentials/', schema: UserId })
    return UserRepository.of({
      insert: Effect.fn('UserRepository.insert')(function* (user, credential) {
        yield* users.set(user.id, user)
        yield* credentials.set(credentialKey(credential), user.id)
      }),
      selectById: Effect.fn('UserRepository.selectById')(function* (id) {
        return yield* users.get(id)
      }),
      selectByCredential: Effect.fn('UserRepository.selectByCredential')(function* (credential) {
        const id = yield* credentials.get(credentialKey(credential))
        return Option.isSome(id) ? yield* users.get(id.value) : Option.none()
      }),
    })
  }),
)
