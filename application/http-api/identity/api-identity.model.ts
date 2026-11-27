import { Schema } from 'effect'

import { IdentityClaims } from '@app-template/application/identity/contract'

/** `IdentityClaims` on the wire: a struct of its fields, as a `Schema.Class` has no `json`. */
export const ApiIdentity = Schema.Struct(IdentityClaims.fields).annotate({
  identifier: 'ApiIdentity',
})
