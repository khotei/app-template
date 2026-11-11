import { createInsertSchema } from 'drizzle-orm/effect-schema'
import { Schema, SchemaGetter, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { MessageColumns, messages } from '#kernel/data/chat/message.table'
import { newestFirst } from '#kernel/data/chat/run.entity'
import { RunColumns } from '#kernel/data/chat/run.table'

/**
 * A message with its attachments, in upload order, and its Run, flat: a user's the newest that
 * answers it, an assistant's the one that wrote it. Every read nests them (`withAttachments`,
 * `withRun`) and decodes with `MessageEntityFromRead`.
 */
export const MessageEntity = Schema.Struct({
  ...MessageColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
  run: Schema.NullOr(RunColumns),
})
export type MessageEntity = typeof MessageEntity.Type

export const MessageEntityInsert = createInsertSchema(messages)

/** `userId` is the owner of the row's chat, not a column of `messages`. */
export type MessageEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<MessageEntity, 'id' | 'chatId'>> & Partial<{ readonly userId: string }>
>

export const inCreationOrder = { createdAt: 'asc', id: 'asc' } as const

export const withAttachments = { attachments: { orderBy: inCreationOrder } } as const

/** The two relations a read fills; `MessageEntityFromRead` keeps the one the author has. */
export const withRun = { latestRun: { orderBy: newestFirst }, replyOf: true } as const

/** What a read returns before the pick: both relations. */
const MessageRead = Schema.Struct({
  ...MessageColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
  latestRun: Schema.NullOr(RunColumns),
  replyOf: Schema.NullOr(RunColumns),
})

/**
 * Decodes a read into the entity: a user's message has its newest Run, a reply the one that wrote
 * it; the entity's decoder drops `latestRun` and `replyOf`.
 */
export const MessageEntityFromRead = MessageRead.pipe(
  Schema.decodeTo(MessageEntity, {
    decode: SchemaGetter.transform((read) => ({
      ...read,
      run: { user: read.latestRun, assistant: read.replyOf }[read.author],
    })),
    encode: SchemaGetter.forbiddenEncoding,
  }),
)
