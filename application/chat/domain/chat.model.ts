import { Effect, Schema } from 'effect'
import { Model } from 'effect/schema'

import { UserId } from '@app-template/application/identity/contract'

import { ChatId } from '#chat/domain/chat.util'
import { textPattern } from '#chat/domain/message.util'
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
}) {}
