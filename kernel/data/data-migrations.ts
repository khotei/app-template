import { join } from 'node:path'

/** The schema's history: its `<id>_<name>.ts` Effect migrations, which `migrateDatabase` applies. */
export const migrationsFolder = join(import.meta.dirname, 'migrations')
