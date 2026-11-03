import { Layer } from 'effect'

import { PgClientTest } from '@app-template/packages/db/testing/e2e'

import { Db } from '#kernel/data/db.client'

/** Publishes `PgClient` too, so a test can open transactions on the connection `Db` uses. */
export const DbTest = Db.layer.pipe(Layer.provideMerge(PgClientTest))
