import { Schema } from 'effect'

import type { Keyed } from '@app-template/packages/db'

import { MessageColumns } from '#kernel/data/chat/message.table'
import { RunColumns } from '#kernel/data/chat/run.table'
import type { FilterOf } from '#kernel/data/relations'

/**
 * A message with its Run, flat: a user's the newest that answers it, an assistant's the one that
 * wrote it. Every read nests it and picks the Run with `buildMessageEntity`.
 */
export const MessageEntity = Schema.Struct({
  ...MessageColumns.fields,
  run: Schema.NullOr(RunColumns),
})
export type MessageEntity = typeof MessageEntity.Type

/** The owner is the row's chat's: `chat: { userId }`, so one of another user's chat reads as absent. */
export type MessageEntityWhere = Keyed<FilterOf<'messages'>, MessageColumns, 'id' | 'chatId'>

export const inCreationOrder = { createdAt: 'asc', id: 'asc' } as const

interface MessageRead extends Omit<MessageEntity, 'run'> {
  readonly newestRun: RunColumns | null
  readonly replyOf: RunColumns | null
}

export const buildMessageEntity = ({
  newestRun,
  replyOf,
  ...message
}: MessageRead): MessageEntity => ({
  ...message,
  run: { user: newestRun, assistant: replyOf }[message.author],
})
