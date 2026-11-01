import { fileURLToPath } from 'node:url'

/** The schema's history: drizzle-kit writes it from the tables, `migrateDatabase` applies it. */
export const migrationsFolder = fileURLToPath(new URL('migrations', import.meta.url))
