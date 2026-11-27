import { Schema } from 'effect'

import type { Keyed } from '@app-template/packages/db'

import { MessageColumns } from '#kernel/data/chat/message.table'
import { RunColumns } from '#kernel/data/chat/run.table'
import { RowOrder } from '#kernel/data/data-order'
import type { FilterOf } from '#kernel/data/relations'

/**
 * A message with its Run, flat: a user's the newest that answers it, an assistant's the one that
 * wrote it. Every read nests both and picks the Run with `MessageRow.buildEntity`.
 */
export const MessageEntity = Schema.Struct({
  ...MessageColumns.fields,
  run: Schema.NullOr(RunColumns),
})
export type MessageEntity = typeof MessageEntity.Type

/** A read finds a message by the key or a chat's by `chatId`, narrowed by the rest. */
export type MessageEntityWhere = Keyed<FilterOf<'messages'>, MessageColumns, 'id' | 'chatId'>

interface MessageRead extends Omit<MessageEntity, 'run'> {
  readonly newestRun: RunColumns | null
  readonly replyOf: RunColumns | null
}

/** What `MessageRepository` builds its statements from. */
export class MessageRow {
  /** Every read nests the Runs `buildEntity` picks from. */
  static readonly withRuns = {
    newestRun: { orderBy: RowOrder.newestFirst },
    replyOf: true,
  } as const

  static readonly buildEntity = ({
    newestRun,
    replyOf,
    ...message
  }: MessageRead): MessageEntity => ({
    ...message,
    run: { user: newestRun, assistant: replyOf }[message.author],
  })
}
