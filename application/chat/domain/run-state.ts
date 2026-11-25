import { Predicate, Schema } from 'effect'

import { activeRunStatuses, RunStatus } from '#chat/domain/run.model'

/** What a Run's status says of it, for any shape that holds the status. */
export class RunState {
  static readonly isActive = Predicate.Struct({
    status: Schema.is(RunStatus.pick(activeRunStatuses)),
  })

  /** A Run past `queued` that has not ended. */
  static readonly isStarted = Predicate.Struct({
    status: Schema.is(RunStatus.pick(['generating'])),
  })
}
