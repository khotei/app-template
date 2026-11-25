import { Effect, Option, Schema, type Types } from 'effect'
import { Model } from 'effect/schema'

import { UserId } from '@app-template/application/identity'
import { maxTitleLength, textPattern } from '@app-template/kernel/data'

import { ChatBusyError } from '#chat/domain/chat.error'
import { ChatId } from '#chat/domain/chat.util'
import { ensureRunRetryable, isActiveRun, Run, type RunStatus } from '#chat/domain/run.model'
import { Status } from '#chat/domain/status.model'

/** `queued` while the chat's reply is in work, `failed` after its last reply failed, else `idle`. */
export const ChatStatus = Status.pick(['idle', 'queued', 'failed'])
export type ChatStatus = typeof ChatStatus.Type

/** Its length is counted in UTF-16 code units, as `Schema.isMaxLength` counts them. */
export const ChatTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isNonEmpty(),
  Schema.isMaxLength(maxTitleLength),
  Schema.isPattern(textPattern),
).pipe(Schema.brand('ChatTitle'))
export type ChatTitle = typeof ChatTitle.Type

/** A chat as `chats` holds it, read with its newest Run: an update writes its title and `updatedAt`. */
export class Chat extends Model.Class<Chat>('Chat')({
  id: Model.UuidV7Insert(ChatId),
  userId: UserId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  title: Schema.OptionFromNullOr(ChatTitle).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate,
  /** The newest Run, read with the chat and never written; none before its first ask. */
  run: Schema.OptionFromNullOr(Run).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
    Model.FieldOnly(['select']),
  ),
}) {
  get status(): ChatStatus {
    return buildChatStatus(this.run)
  }

  get isNew(): boolean {
    return isNewChat(this)
  }

  ensureNotBusy() {
    return ensureChatNotBusy(this.run)
  }

  ensureRetryable() {
    return ensureRunRetryable(this.run)
  }
}

/** What a chat's newest Run makes of it; a chat no ask has reached yet is `idle`. */
const chatStatuses = {
  queued: 'queued',
  generating: 'queued',
  done: 'idle',
  failed: 'failed',
} as const satisfies Record<RunStatus, ChatStatus>

export const buildChatStatus = (newestRun: Option.Option<Run>): ChatStatus =>
  Option.match(newestRun, { onNone: () => 'idle', onSome: ({ status }) => chatStatuses[status] })

/** True while no ask has reached the chat: every user message starts a Run, so it has none. */
export const isNewChat = (chat: Types.Simplify<Pick<Chat, 'run'>>): boolean =>
  Option.isNone(chat.run)

/** An ask takes a chat whose newest Run is not in work; one in work is `ChatBusyError`. */
export const ensureChatNotBusy = Effect.fnUntraced(function* (newestRun: Option.Option<Run>) {
  const active = Option.filter<Run>(newestRun, isActiveRun)
  if (Option.isSome(active)) return yield* new ChatBusyError({ id: active.value.chatId })
})
