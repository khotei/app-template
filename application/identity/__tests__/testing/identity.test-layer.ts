import { NodeCrypto } from '@effect/platform-node'
import { Layer } from 'effect'

import { UserRepository } from '@app-template/kernel/data'
import { TransactionTest } from '@app-template/packages/db/testing'

import { IdentityService } from '#identity/services/identity.service'

/** `IdentityService` over `users`, a `Layer.mock` of the methods a case lets it call; one left out dies. */
export const layerIdentityTest = (users: Layer.PartialEffectful<UserRepository['Service']>) =>
  IdentityService.layer.pipe(
    Layer.provide([Layer.mock(UserRepository, users), TransactionTest, NodeCrypto.layer]),
  )
