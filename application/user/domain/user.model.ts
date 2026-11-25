import { Model } from 'effect/schema'

import { UserId } from '#user/domain/user.util'

export class User extends Model.Class<User>('User')({
  id: Model.UuidV7Insert(UserId),
  createdAt: Model.DateTimeInsertFromDate,
}) {}
