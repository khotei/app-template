import { assert, describe, it } from '@effect/vitest'
import { pgTable, QueryBuilder, text } from 'drizzle-orm/pg-core'

import { encodeFilter, id } from '#db/db-columns'

const orders = pgTable('orders', { id: id(), note: text() })

describe('encodeFilter', () => {
  const render = (filter: Parameters<typeof encodeFilter<typeof orders>>[1]) =>
    new QueryBuilder().select().from(orders).where(encodeFilter(orders, filter)).toSQL()

  it('renders the conditions of a filter', () => {
    assert.deepStrictEqual(render({ id: 'a' }), {
      sql: 'select "id", "note" from "orders" where "orders"."id" = $1',
      params: ['a'],
    })
  })

  it('renders a filter of no condition as one no row matches', () => {
    assert.strictEqual(render({}).sql, 'select "id", "note" from "orders" where false')
  })
})
