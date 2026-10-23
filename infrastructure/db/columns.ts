import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

// Builders, not shared column objects: a table names a builder's column the first time it sees
// it, so one object reused under another key would keep the first name.

/** The primary key; the domain writes every id, and `uuidv7()` serves hand-written SQL only. */
export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

/** Written with the domain's clock, so it has no database default. */
export const createdAt = () => timestamp({ withTimezone: true }).notNull()

/** Written with the domain's clock, so it has no database default and no `$onUpdate`. */
export const updatedAt = () => timestamp({ withTimezone: true }).notNull()
