import { SqlClient } from 'effect/sql'

/** The one migration `db-migrate.e2e.ts` applies: a table of its own. */
export default SqlClient.SqlClient.use((sql) => sql`CREATE TABLE probes (id integer PRIMARY KEY)`)
