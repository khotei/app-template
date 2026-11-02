import { join } from 'node:path'

/** The schema's history: drizzle-kit writes it from the tables, `migrateDatabase` applies it. */
export const migrationsFolder = join(import.meta.dirname, 'migrations')
