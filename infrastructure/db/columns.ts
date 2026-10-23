import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/** A fresh `uuid` primary key builder, `DEFAULT uuidv7()`. */
export const id = () => uuid().primaryKey().default(sql`uuidv7()`)

/** A fresh `timestamptz` builder, not null, with no default. */
export const createdAt = () => timestamp({ withTimezone: true }).notNull()
