import { assert, describe, it } from '@effect/vitest'
import { Option } from 'effect'

import { encodeWhere } from '#kernel/data/data-where'

describe('encodeWhere', () => {
  it('leaves a plain value as it is', () => {
    assert.deepStrictEqual(encodeWhere({ id: 'a', paid: true }), { id: 'a', paid: true })
  })

  it('turns an Option of none into a column that is null', () => {
    assert.deepStrictEqual(encodeWhere({ id: 'a', note: Option.none<string>() }), {
      id: 'a',
      note: { isNull: true },
    })
  })

  it('turns an Option of some into its value', () => {
    assert.deepStrictEqual(encodeWhere({ id: 'a', note: Option.some('gift') }), {
      id: 'a',
      note: 'gift',
    })
  })

  it('turns a list into any of its values, as a copy', () => {
    const statuses: ReadonlyArray<'placed' | 'paid'> = ['placed', 'paid']

    const filter = encodeWhere({ id: 'a', status: statuses })

    assert.deepStrictEqual(filter, { id: 'a', status: { in: ['placed', 'paid'] } })
    assert.notStrictEqual(filter.status.in, statuses)
  })

  it('turns a range into its bounds, each included, one left out when absent', () => {
    assert.deepStrictEqual(encodeWhere({ id: { from: 'a', to: 'c' }, at: { from: 1 } }), {
      id: { gte: 'a', lte: 'c' },
      at: { gte: 1 },
    })
  })
})
