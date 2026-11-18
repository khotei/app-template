import { Schema } from 'effect'

import { decodeRowWith, encodeRowWith } from '@app-template/packages/db'

import { User } from '#identity/domain/user.model'

export const encodeUser = encodeRowWith(User)

export const decodeUser = decodeRowWith(Schema.Option(User))
