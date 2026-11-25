import { Context } from 'effect'

import type { UserId } from '@app-template/application/user/contract'

/**
 * What a request's credential names, provided by the api's `Auth` to the handlers behind it; the
 * user's whole record is a `User`.
 */
export class Identity extends Context.Service<Identity, { readonly userId: UserId }>()(
  '@app-template/application/identity/domain/Identity',
) {}
