import { Layer } from 'effect'

import { PgClientTest } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'

/** Publishes `PgClient` too, as `Db.layerFromConfig` does, so a test can open transactions. */
export const DbTest = Db.layer.pipe(Layer.provideMerge(PgClientTest))
