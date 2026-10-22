import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { PgClientTest } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { migrateDatabase } from '#infrastructure/db/migrate'

describe('migrateDatabase', () => {
  it.effect('applies nothing to a database copied from the migrated template', () =>
    Effect.map(migrateDatabase, (applied) => assert.strictEqual(applied, 0)).pipe(
      Effect.provide(Db.layer.pipe(Layer.provide(PgClientTest))),
    ),
  )
})
