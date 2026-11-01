import { Effect, flow, Schema } from 'effect'

import { decodeOptionalWith, encodeRowWith } from '@app-template/db'
import { UserId } from '@app-template/identity-contract'
import { UserEntity, UserEntityInsert } from '@app-template/kernel/data/user'

import { Credential, User } from '#domain/user.model'

export const UserFromEntity = Schema.Struct({
  ...UserEntity.fields,
  id: UserId,
  createdAt: Schema.DateTimeUtcFromDate,
}).pipe(Schema.decodeTo(User))

export const encodeUser = encodeRowWith(UserFromEntity, UserEntityInsert)

export const decodeUser = decodeOptionalWith(UserFromEntity)

/** A credential's fields are already the data layer's, so its own schema encodes it. */
export const encodeCredential = flow(Schema.encodeEffect(Credential), Effect.orDie)
