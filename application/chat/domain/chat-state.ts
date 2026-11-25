import { Option, Schema, type Types } from 'effect'

import type { Run, RunStatus } from '#chat/domain/run.model'

/** What a chat's newest Run makes of it. */
const chatStates = {
  queued: 'queued',
  generating: 'queued',
  done: 'idle',
  failed: 'failed',
} as const satisfies Record<RunStatus, typeof ChatState.values.Type>

/** What a chat's newest Run says of it, for any shape that holds that Run. */
export class ChatState {
  /** `queued` while the chat's reply is in work, `failed` after its last reply failed, else `idle`. */
  static readonly values = Schema.Literals(['idle', 'queued', 'failed'])

  /** A chat no ask has reached yet is `idle`. */
  static readonly build = (
    newestRun: Option.Option<Types.Simplify<Pick<Run, 'status'>>>,
  ): typeof ChatState.values.Type =>
    Option.match(newestRun, { onNone: () => 'idle', onSome: ({ status }) => chatStates[status] })

  /** True while no ask has reached the chat: every user message starts a Run, so none is newest. */
  static readonly isNew = (newestRun: Option.Option<unknown>): boolean => Option.isNone(newestRun)
}
