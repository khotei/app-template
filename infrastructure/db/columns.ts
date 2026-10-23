import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

// Builders, not shared column objects: a table names a builder's column the first time it sees
// it, so one object reused under another key would keep the first name.

export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

export const createdAt = () => timestamp({ withTimezone: true }).notNull()
