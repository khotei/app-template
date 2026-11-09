import { createSelectSchema } from 'drizzle-orm/effect-schema'

import { RunFailureJson, RunProvenanceJson, runs } from '#kernel/data/chat/run.table'

export const RunEntity = createSelectSchema(runs, {
  failure: () => RunFailureJson,
  provenance: () => RunProvenanceJson,
})
export type RunEntity = typeof RunEntity.Type
