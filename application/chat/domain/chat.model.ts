import { Effect, Option, Schema } from 'effect'
import { Model } from 'effect/schema'

import { UserId } from '@app-template/application/identity'

import { ChatBusyError } from '#chat/domain/chat.error'
import { ChatId, maxTitleLength, textPattern } from '#chat/domain/chat.util'
import { isActiveRun } from '#chat/domain/run.model'
import { NestedRun, type RunStatus } from '#chat/domain/run-fields.model'
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

/** A chat as `chats` holds it: an update writes its title and `updatedAt`. */
export class ChatFields extends Model.Class<ChatFields>('ChatFields')({
  id: Model.UuidV7Insert(ChatId),
  userId: UserId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  title: Schema.OptionFromNullOr(ChatTitle).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate,
}) {}

export class Chat extends ChatFields.extend<Chat>('Chat')({
  /** The newest Run, read with the chat and never written; none before its first ask. */
  run: Model.FieldOnly(['select', 'json'])(
    Schema.OptionFromNullOr(NestedRun).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  ),
}) {}

/** What a chat's newest Run makes of it; a chat no ask has reached yet is `idle`. */
const chatStatuses = {
  queued: 'queued',
  generating: 'queued',
  done: 'idle',
  failed: 'failed',
} as const satisfies Record<RunStatus, ChatStatus>

export const buildChatStatus = (newestRun: Option.Option<NestedRun>): ChatStatus =>
  Option.match(newestRun, { onNone: () => 'idle', onSome: ({ status }) => chatStatuses[status] })

/** True while no ask has reached the chat: every user message starts a Run, so it has none. */
export const isNewChat = (chat: Chat): boolean => Option.isNone(chat.run)

/** An ask takes a chat whose newest Run is not in work; one in work is `ChatBusyError`. */
export const ensureChatNotBusy = Effect.fnUntraced(function* (newestRun: Option.Option<NestedRun>) {
  const active = Option.filter<NestedRun>(newestRun, isActiveRun)
  if (Option.isSome(active)) return yield* new ChatBusyError({ id: active.value.chatId })
})
