import { Schema } from 'effect'

import { User, UserId } from '@app-template/domain/user'
import { UserEntity } from '@app-template/kernel/data/user'

export const UserFromEntity = Schema.Struct({
  ...UserEntity.fields,
  id: UserId,
  createdAt: Schema.DateTimeUtcFromDate,
}).pipe(Schema.decodeTo(User))
