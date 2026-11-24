import { assert, describe, it } from '@effect/vitest'
import { sql } from 'drizzle-orm'
import { pgTable, QueryBuilder, text } from 'drizzle-orm/pg-core'

import { buildFilter, encodeFilter, id } from '#db/db-columns'

const orders = pgTable('orders', { id: id(), note: text() })
const since = new Date(0)

const kept: ReadonlyArray<{ name: string; filter: object; built: object }> = [
  {
    name: 'drops a field left undefined, at any depth',
    filter: { id: 'a', note: undefined, customer: { name: undefined, city: 'Lisbon' } },
    built: { id: 'a', customer: { city: 'Lisbon' } },
  },
  {
    name: 'keeps a value that is no filter object',
    filter: { createdAt: { gt: since }, status: { in: ['placed', 'shipped'] } },
    built: { createdAt: { gt: since }, status: { in: ['placed', 'shipped'] } },
  },
]

describe('buildFilter', () => {
  it.each(kept)('$name', ({ filter, built }) => {
    assert.deepStrictEqual(buildFilter(filter), built)
  })

  it.each([
    { name: 'no field', filter: {} },
    { name: 'only fields left undefined', filter: { id: undefined, note: undefined } },
  ])('a filter of $name matches no row', ({ filter }) => {
    assert.deepStrictEqual(buildFilter(filter), { RAW: sql`false` })
  })
})

describe('encodeFilter', () => {
  const render = (filter: Parameters<typeof encodeFilter<typeof orders>>[1]) =>
    new QueryBuilder().select().from(orders).where(encodeFilter(orders, filter)).toSQL()

  it('renders the conditions of a filter, a field left undefined skipped', () => {
    assert.deepStrictEqual(render({ id: 'a', note: undefined }), {
      sql: 'select "id", "note" from "orders" where "orders"."id" = $1',
      params: ['a'],
    })
  })

  it('renders a filter of no condition as one no row matches', () => {
    assert.strictEqual(render({}).sql, 'select "id", "note" from "orders" where false')
  })
})
