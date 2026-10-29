import { defineConfig } from 'drizzle-kit'

// No credentials: `generate` needs no database, and `make migrate` applies through `DatabaseConfig`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './*/*.entity.ts',
  out: './db/migrations',
})
