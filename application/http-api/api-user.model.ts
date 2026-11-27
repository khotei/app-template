import { User } from '@app-template/application/user/contract'

export const ApiUser = User.json.annotate({ identifier: 'ApiUser' })
