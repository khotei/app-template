import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Each helper returns a fresh builder: a table names a builder's column the first time it sees it,
 * so one builder shared under two keys would keep the first name.
 */
export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

export const createdAt = () => timestamp({ withTimezone: true }).notNull()
