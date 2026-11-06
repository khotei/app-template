import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { AttachmentId } from '#chat/domain/attachment.id'
import { Attachment, FileName, FileSize, MediaType } from '#chat/domain/attachment.model'
import { AttachmentFromEntity, encodeAttachment } from '#chat/services/attachment.mapper'
import { owner } from '#testing/chat/chat.test-fixture'

const attachment = new Attachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000102'),
  userId: owner,
  messageId: Option.none(),
  chatId: Option.none(),
  fileName: FileName.make('notes.txt'),
  mediaType: MediaType.make('Az09!#$&^_.+-/Az09!#$&^_.+-'),
  size: FileSize.make(42),
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
})

describe('AttachmentFromEntity', () => {
  it.effect(
    'encodes a media type of every allowed character for attachments and reads it back',
    () =>
      Effect.gen(function* () {
        const row = yield* encodeAttachment(attachment)
        const read = yield* Schema.decodeUnknownEffect(AttachmentFromEntity)(row)

        assertSchemaEquals(Attachment, read, attachment)
      }),
  )
})
