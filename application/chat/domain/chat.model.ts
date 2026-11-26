import { Effect, Schema } from 'effect'
import { Model } from 'effect/schema'

import { UserId } from '@app-template/application/user/contract'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId, textPattern } from '#chat/domain/message.util'
import { Run } from '#chat/domain/run.model'

export const maxTitleLength = 120

/** Its length is counted in UTF-16 code units, as `Schema.isMaxLength` counts them. */
export const ChatTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isNonEmpty(),
  Schema.isMaxLength(maxTitleLength),
  Schema.isPattern(textPattern),
).pipe(Schema.brand('ChatTitle'))
export type ChatTitle = typeof ChatTitle.Type

/**
 * What a chat keeps of its context once cut: the latest summary of the messages a reply no
 * longer sends, and the message its replies send from.
 */
export const ChatAssistantContext = Schema.Struct({
  summary: Schema.String,
  startMessageId: MessageId,
})
export type ChatAssistantContext = typeof ChatAssistantContext.Type

export class ChatNotFoundError extends Schema.TaggedError<ChatNotFoundError>()(
  'ChatNotFoundError',
  { id: ChatId },
  { httpApiStatus: 404 },
) {}

export class ChatBusyError extends Schema.TaggedError<ChatBusyError>()(
  'ChatBusyError',
  { id: ChatId },
  { httpApiStatus: 409 },
) {}

/**
 * A chat as `chats` holds it, read with its newest Run: an update writes its title or context,
 * and `updatedAt`; no json variant holds `context`.
 */
export class Chat extends Model.Class<Chat>('Chat')({
  id: Model.UuidV7Insert(ChatId),
  userId: UserId.pipe(Model.FieldExcept(['update', 'jsonUpdate'])),
  title: Schema.OptionFromNullOr(ChatTitle).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  /** None until the chat's context is cut: a reply then sends every message. */
  context: Schema.OptionFromNullOr(ChatAssistantContext).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
    Model.Sensitive,
  ),
  createdAt: Model.DateTimeInsertFromDate,
  updatedAt: Model.DateTimeUpdateFromDate,
  /** The newest Run, read with the chat and never written; none before its first ask. */
  run: Schema.OptionFromNullOr(Run).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
    Model.FieldOnly(['select']),
  ),
}) {}
