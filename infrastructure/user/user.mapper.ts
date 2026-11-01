import { Schema } from 'effect'

import { User } from '@app-template/identity/domain'
import { UserId } from '@app-template/identity-contract'
import { UserEntity } from '@app-template/kernel/data/user'

export const UserFromEntity = Schema.Struct({
  ...UserEntity.fields,
  id: UserId,
  createdAt: Schema.DateTimeUtcFromDate,
}).pipe(Schema.decodeTo(User))
