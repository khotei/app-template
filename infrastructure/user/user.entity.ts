import { sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, pgEnum, snakeCase, text, uuid } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import { Credential, secretHashPattern, UserId } from '@app-template/domain/user'

import { createdAt, id } from '#infrastructure/db/columns'

export const users = snakeCase.table('users', { id: id(), createdAt: createdAt() })

export const credentialKind = pgEnum('credential_kind', [Credential.fields.kind.literal])

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

const userFields = { id: UserId, createdAt: Schema.DateTimeUtcFromDate }

export const UserRow = createSelectSchema(users, userFields)

export const UserInsert = createInsertSchema(users, userFields)
