import { type DateTime, Effect, Option, pipe, Schema, String as Str } from 'effect'

import { ChatBusyError, ChatStatusInvalidError } from '#domain/chat/chat.error'
import { ChatId } from '#domain/chat/chat.id'
import { ChatStatus, type SettledChatStatus } from '#domain/chat/chat-status.model'
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
  status: ChatStatus,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}

/** Takes the chat for a send's reply; a chat whose reply is still in work refuses it. */
export const queueChat = Effect.fn('queueChat')(function* (chat: Chat) {
  if (chat.status === 'queued') return yield* new ChatBusyError({ id: chat.id })
  return new Chat({ ...chat, status: 'queued' })
})

// Only a chat whose reply is in work has one to end.
const settleChat = Effect.fnUntraced(function* (chat: Chat, to: SettledChatStatus) {
  if (chat.status !== 'queued') {
    return yield* new ChatStatusInvalidError({ id: chat.id, from: chat.status, to })
  }
  return new Chat({ ...chat, status: to })
})

export const freeChat = Effect.fn('freeChat')((chat: Chat) => settleChat(chat, 'idle'))

export const failChat = Effect.fn('failChat')((chat: Chat) => settleChat(chat, 'failed'))

export const buildChat = (input: {
  readonly id: ChatId
  readonly userId: UserId
  readonly createdAt: DateTime.Utc
}): Chat =>
  new Chat({
    id: input.id,
    userId: input.userId,
    title: Option.none(),
    status: 'idle',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })
