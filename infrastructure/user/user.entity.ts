import { sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, pgEnum, snakeCase, text, uuid } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import { Credential, SecretHash, UserId } from '@app-template/domain/user'

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
  // The pattern of `SecretHash`, which keeps its regular expression private.
  (table) => [check('credentials_hash_check', sql`${table.hash} ~ '^[0-9a-f]{64}$'`)],
)

const userFields = { id: UserId, createdAt: Schema.DateTimeUtcFromDate }

export const UserRow = createSelectSchema(users, userFields)

export const UserInsert = createInsertSchema(users, userFields)

export const CredentialInsert = createInsertSchema(credentials, {
  hash: SecretHash,
  userId: UserId,
})
