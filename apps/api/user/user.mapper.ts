import type { User } from '@app-template/application/identity'
import type { ApiUser } from '@app-template/http-api'

export const buildApiUser = (user: User): ApiUser => user
