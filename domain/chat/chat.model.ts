import { type DateTime, Option, pipe, Schema, String as Str } from 'effect'

import { ChatId } from '#domain/chat/chat.id'
import type { Message } from '#domain/chat/message.model'
import { UserId } from '#domain/user/user.id'

/** Counted in UTF-16 code units, as `Schema.isMaxLength` counts them. */
export const maxTitleLength = 120

export const ChatTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isNonEmpty(),
  Schema.isMaxLength(maxTitleLength),
).pipe(Schema.brand('ChatTitle'))
export type ChatTitle = typeof ChatTitle.Type

// Grapheme boundaries are the same in every locale (UAX #29); a fixed tag keeps the ambient
// locale out of the domain.
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })

// Whole graphemes, so an emoji is never split, while the length stays within the code units
// `ChatTitle` counts.
const cutToTitleLength = (text: string): string => {
  let cut = ''
  for (const { segment } of graphemes.segment(text)) {
    if (cut.length + segment.length > maxTitleLength) break
    cut += segment
  }
  return cut
}

/**
 * The title `text` yields once trimmed and cut to `maxTitleLength`; none when blank.
 *
 * Trimmed before the cut so the limit counts visible text, and after it so the cut leaves no edge.
 */
export const buildChatTitle = (text: string): Option.Option<ChatTitle> =>
  pipe(text, Str.trim, cutToTitleLength, Str.trim, Schema.decodeUnknownOption(ChatTitle))

export class Chat extends Schema.Class<Chat>('Chat')({
  id: ChatId,
  userId: UserId,
  title: Schema.Option(ChatTitle),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}

/** `busy` while the chat has an active message, else `idle`. */
export const ChatStatus = Schema.Literals(['idle', 'busy'])
export type ChatStatus = typeof ChatStatus.Type

/** A chat with its status, which no row stores: `withStatus` derives it. */
export class ChatWithStatus extends Chat.extend<ChatWithStatus>('ChatWithStatus')({
  status: ChatStatus,
}) {}

export const withStatus = (chat: Chat, active: Option.Option<Message>): ChatWithStatus =>
  new ChatWithStatus({ ...chat, status: Option.isSome(active) ? 'busy' : 'idle' })

export const buildChat = (input: {
  readonly id: ChatId
  readonly userId: UserId
  readonly createdAt: DateTime.Utc
}): Chat =>
  new Chat({
    id: input.id,
    userId: input.userId,
    title: Option.none(),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })
