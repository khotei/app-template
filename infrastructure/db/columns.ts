import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

// Functions, not shared constants: each call returns a fresh builder, because a table names a
// builder's column the first time it sees it, so a constant reused under another key would keep
// the first name.

export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

export const createdAt = () => timestamp({ withTimezone: true }).notNull()
