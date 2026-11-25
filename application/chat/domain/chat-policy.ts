import { Effect, Option, type Types } from 'effect'

import { ChatBusyError } from '#chat/domain/chat.model'
import type { Run } from '#chat/domain/run.model'
import { RunState } from '#chat/domain/run-state'

/** The checks a chat passes before an ask. */
export class ChatPolicy {
  /** An ask takes a chat whose newest Run is not in work; one in work is `ChatBusyError`. */
  static readonly ensureNotBusy = Effect.fnUntraced(function* <
    R extends Types.Simplify<Pick<Run, 'chatId' | 'status'>>,
  >(newestRun: Option.Option<R>) {
    const active = Option.filter<R>(newestRun, RunState.isActive)
    if (Option.isSome(active)) return yield* new ChatBusyError({ id: active.value.chatId })
  })
}
