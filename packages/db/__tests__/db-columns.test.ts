import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { pgTable, QueryBuilder, text } from 'drizzle-orm/pg-core'

import { buildFilter, encodeFilter, id } from '#db/db-columns'

const orders = pgTable('orders', { id: id(), note: text() })

describe('buildFilter', () => {
  it('returns a filter that names a field as it is', () => {
    const filter = { id: 'a', status: { in: ['placed', 'shipped'] } }

    assert.strictEqual(buildFilter(filter), filter)
  })

  it('a filter of no field matches no row', () => {
    assert.deepStrictEqual(buildFilter({}), { RAW: sql`false` })
  })
})

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
