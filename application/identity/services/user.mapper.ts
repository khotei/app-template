import { decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { User } from '#identity/domain/user.model'

export const encodeUser = encodeRowWith(User)

export const decodeUser = decodeOptionalWith(User)
