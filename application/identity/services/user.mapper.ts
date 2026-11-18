import { Schema } from 'effect'

import { UserEntity } from '@app-template/kernel/data'
import { decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { UserId } from '#identity/contract/user.id'
import { User } from '#identity/domain/user.model'

export const UserFromEntity = Schema.Struct({
  ...UserEntity.fields,
  id: UserId,
  createdAt: Schema.DateTimeUtcFromDate,
}).pipe(Schema.decodeTo(User))

export const encodeUser = encodeRowWith(UserFromEntity)

export const decodeUser = decodeOptionalWith(UserFromEntity)
