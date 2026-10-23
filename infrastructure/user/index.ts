import { UserRepositoryKv, UserRepositoryPg } from '#infrastructure/user/user.repository'

export * from '#infrastructure/user/user.repository'

export const UserKv = UserRepositoryKv

export const UserPg = UserRepositoryPg
