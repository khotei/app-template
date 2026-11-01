import { sql } from 'drizzle-orm'
import { check, pgEnum, snakeCase, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, id } from '@app-template/db'

const secretHashPattern = /^[0-9a-f]{64}$/

export const users = snakeCase.table('users', { id: id(), createdAt: createdAt() })

export const credentialKind = pgEnum('credential_kind', ['secret'])

export const credentials = snakeCase.table(
  'credentials',
  {
    hash: text().primaryKey(),
    kind: credentialKind().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [check('credentials_hash_check', sql`${table.hash} ~ ${secretHashPattern.source}`)],
)
