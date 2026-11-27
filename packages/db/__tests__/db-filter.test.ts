import { assert, describe, it } from '@effect/vitest'
import { pgTable, QueryBuilder, text } from 'drizzle-orm/pg-core'

import { DbColumn } from '#db/db-column'
import { DbFilter } from '#db/db-filter'

const orders = pgTable('orders', { id: DbColumn.id(), note: text() })

describe('DbFilter.encode', () => {
  const render = (filter: Parameters<typeof DbFilter.encode<typeof orders>>[1]) =>
    new QueryBuilder().select().from(orders).where(DbFilter.encode(orders, filter)).toSQL()

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
