import { defineConfig } from 'drizzle-kit'

// No credentials: `generate` needs no database, and `make migrate` applies through `DatabaseConfig`.
// drizzle-kit resolves these paths against the working directory, the root, not this file.
export default defineConfig({
  dialect: 'postgresql',
  schema: 'kernel/data/*/*.table.ts',
  out: 'kernel/data/migrations',
})
