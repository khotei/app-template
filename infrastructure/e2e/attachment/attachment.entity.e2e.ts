import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import {
  Attachment,
  AttachmentId,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import { UserId } from '@app-template/domain/user'

import { AttachmentInsert, attachments } from '#infrastructure/attachment/attachment.entity'
import { Db } from '#infrastructure/db/db.client'
import { DbTest, flipSqlError } from '#infrastructure/db/testing/db.test-layer'
import { insertUser } from '#infrastructure/testing/rows.test-util'

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000090')

const attachment = new Attachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000093'),
  userId,
  messageId: Option.none(),
  fileName: FileName.make('notes.txt'),
  mediaType: MediaType.make('text/plain'),
  size: FileSize.make(42),
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
})

describe('attachments', () => {
  it.effect.each([
    { name: 'an empty file name', check: 'attachments_file_name_check', fields: { fileName: '' } },
    {
      name: 'a media type without a subtype',
      check: 'attachments_media_type_check',
      fields: { mediaType: 'text' },
    },
    { name: 'a negative size', check: 'attachments_size_check', fields: { size: -1 } },
  ])('refuses $name through its check', ({ check, fields }) =>
    Effect.gen(function* () {
      const db = yield* Db
      const row = Schema.encodeSync(AttachmentInsert)(attachment)

      yield* insertUser(userId)
      const error = yield* flipSqlError(db.insert(attachments).values({ ...row, ...fields }))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), check)
    }).pipe(Effect.provide(DbTest)),
  )
})
