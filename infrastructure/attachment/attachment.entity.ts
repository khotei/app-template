import { sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { check, index, integer, snakeCase, text, uuid } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'

import {
  AttachmentId,
  FileName,
  FileSize,
  MediaType,
  mediaTypePattern,
} from '@app-template/domain/attachment'
import { MessageId } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'

import { messages } from '#infrastructure/chat/message.entity'
import { createdAt, id } from '#infrastructure/db/columns'
import { users } from '#infrastructure/user/user.entity'

export const attachments = snakeCase.table(
  'attachments',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    messageId: uuid().references(() => messages.id, { onDelete: 'restrict' }),
    fileName: text().notNull(),
    mediaType: text().notNull(),
    size: integer().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check('attachments_file_name_check', sql`${table.fileName} <> ''`),
    check('attachments_media_type_check', sql`${table.mediaType} ~* ${mediaTypePattern.source}`),
    check('attachments_size_check', sql`${table.size} >= 0`),
    index('attachments_message_id_created_at_id_index').on(
      table.messageId,
      table.createdAt,
      table.id,
    ),
  ],
)

const attachmentFields = {
  id: AttachmentId,
  userId: UserId,
  messageId: Schema.OptionFromNullOr(MessageId),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtcFromDate,
}

export const AttachmentRow = createSelectSchema(attachments, attachmentFields)

export const AttachmentInsert = createInsertSchema(attachments, attachmentFields)
