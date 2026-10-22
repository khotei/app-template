import { Layer } from 'effect'

import { PgClientTest } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'

/** `Db` on a fresh database copied from the migrated template: provide it per test. */
export const DbTest = Db.layer.pipe(Layer.provide(PgClientTest))
