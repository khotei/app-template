import { Context } from 'effect'

import type { UserId } from '@app-template/application/user/contract'

/** The user the api's `Auth` recognised for the request, provided to the handlers behind it. */
export class CurrentUser extends Context.Service<CurrentUser, { readonly id: UserId }>()(
  '@app-template/application/identity/domain/CurrentUser',
) {}
