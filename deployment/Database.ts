import * as path from 'node:path'

import * as AWS from '@alchemy.run/aws'

export const databaseName = 'app'

/** The app's Postgres, its tables brought up to `kernel/data/migrations` on each deploy. */
export const Database = AWS.RDS.DBInstance('Database', {
  engine: 'postgres',
  engineVersion: '18',
  dbInstanceClass: 'db.t3.micro',
  dbName: databaseName,
  masterUsername: 'app',
  manageMasterUserPassword: true,
  migrations: path.join(import.meta.dirname, '../kernel/data/migrations'),
  migrationsTransport: 'direct',
})
