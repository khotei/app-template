import { Schema } from 'effect'

import { Identity } from '@app-template/application/identity/contract'

/** An `Identity` on the wire: a struct of its fields, as a `Schema.Class` has no `json` variant. */
export const ApiIdentity = Schema.Struct(Identity.fields).annotate({ identifier: 'ApiIdentity' })
