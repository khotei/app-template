import { Effect, flow, Schema } from 'effect'

import { UserEntity, UserEntityInsert } from '@app-template/kernel/data'
import { decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { UserId } from '#identity/contract/user.id'
import { Credential, User } from '#identity/domain/user.model'

export const UserFromEntity = Schema.Struct({
  ...UserEntity.fields,
  id: UserId,
  createdAt: Schema.DateTimeUtcFromDate,
}).pipe(Schema.decodeTo(User))

export const encodeUser = encodeRowWith(UserFromEntity, UserEntityInsert)

export const decodeUser = decodeOptionalWith(UserFromEntity)

/** A credential's fields are already the data layer's, so its own schema encodes it. */
export const encodeCredential = flow(Schema.encodeEffect(Credential), Effect.orDie)
