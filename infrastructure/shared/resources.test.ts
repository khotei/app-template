import { assert, describe, it } from '@effect/vitest'
import { Duration } from 'effect'

import { resources } from '@app-template/aws'
import { unboundLifetime } from '@app-template/domain/attachment'

describe('the inventory and the attachment lifetime agree', () => {
  it('the attachments bucket expires unbound objects no sooner than unboundLifetime', () => {
    const { unboundExpirationDays } = resources.buckets.attachments.lifecycle

    assert.isTrue(
      Duration.isGreaterThanOrEqualTo(Duration.days(unboundExpirationDays), unboundLifetime),
      `bucket 'attachments': unboundExpirationDays (${unboundExpirationDays}) is shorter than ` +
        `unboundLifetime (${Duration.format(unboundLifetime)})`,
    )
  })
})
