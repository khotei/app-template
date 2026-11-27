import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * The columns every table declares alike, as Drizzle's builders are called in a table.
 *
 * Functions, not shared constants: each call returns a fresh builder, because a table names a
 * builder's column the first time it sees it, so a constant reused under another key would keep
 * the first name.
 */
export class DbColumn {
  static readonly id = () => uuid().primaryKey().default(sql`uuidv7()`)

  static readonly createdAt = () => timestamp({ withTimezone: true }).notNull()

  static readonly updatedAt = () => timestamp({ withTimezone: true }).notNull()
}
