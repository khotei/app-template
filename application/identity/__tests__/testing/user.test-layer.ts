import { BunCrypto } from '@effect/platform-bun'
import { Layer } from 'effect'

import { UserRepository } from '@app-template/kernel/data'
import { TransactionTest } from '@app-template/packages/db/testing'

import { UserService } from '#identity/services/user.service'

/** `UserService` over `users`, a `Layer.mock` of the methods a case lets it call; one left out dies. */
export const layerUserTest = (users: Layer.PartialEffectful<UserRepository['Service']>) =>
  UserService.layer.pipe(
    Layer.provide([Layer.mock(UserRepository, users), TransactionTest, BunCrypto.layer]),
  )
