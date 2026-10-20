import { UserRepositoryKv } from '#infrastructure/user/user.repository'

export * from '#infrastructure/user/user.repository'

/** Every adapter of the user aggregate on `KeyValueStore`. */
export const UserKv = UserRepositoryKv
