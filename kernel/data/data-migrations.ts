import { join } from 'node:path'

/**
 * The schema's history: its `<id>_<name>.ts` Effect migrations, which `migrateDatabase` applies, and
 * the folders drizzle-kit writes from the tables, which `make migration-check` reads.
 */
export const migrationsFolder = join(import.meta.dirname, 'migrations')
