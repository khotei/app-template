import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, pipe, Schema } from 'effect'

import { Attachment, AttachmentId, FileName, FileSize, MediaType } from '@app-template/chat/domain'
import { AttachmentFromEntity } from '@app-template/chat/services'
import { owner } from '@app-template/chat/testing'
import { Db } from '@app-template/kernel/data'
import { AttachmentEntityInsert, attachments } from '@app-template/kernel/data/attachment'
import { assertSchemaEquals } from '@app-template/testing'

import { DbWithUsersTest } from '#testing-e2e/db.test-layer'

const attachment = new Attachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000102'),
  userId: owner,
  messageId: Option.none(),
  chatId: Option.none(),
  fileName: FileName.make('notes.txt'),
  // Every character the pattern allows, upper case among them.
  mediaType: MediaType.make('Az09!#$&^_.+-/Az09!#$&^_.+-'),
  size: FileSize.make(42),
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
})

describe('AttachmentFromEntity on Postgres', () => {
  it.effect('writes a media type of every allowed character and reads it back', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const row = pipe(
        attachment,
        Schema.encodeSync(AttachmentFromEntity),
        Schema.decodeSync(AttachmentEntityInsert),
      )

      yield* db.insert(attachments).values(row)
      const selected = yield* db.query.attachments
        .findFirst({ where: { id: attachment.id } })
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(AttachmentFromEntity)))

      assertSchemaEquals(Attachment, selected, attachment)
    }).pipe(Effect.provide(DbWithUsersTest)),
  )
})
