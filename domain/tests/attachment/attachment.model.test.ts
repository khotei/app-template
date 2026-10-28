import { assert, describe, it } from '@effect/vitest'
import { DateTime, Exit, Option, Schema } from 'effect'

import { AttachmentId } from '#domain/attachment/attachment.id'
import {
  Attachment,
  buildAttachment,
  FileName,
  FileSize,
  isExpired,
  MediaType,
} from '#domain/attachment/attachment.model'
import { MessageId } from '#domain/chat/chat.id'
import { UserId } from '#domain/user/user.id'

describe('Attachment', () => {
  const encoded = {
    id: '0192d4e0-7b3a-7c00-8000-000000000020',
    userId: '0192d4e0-7b3a-7c00-8000-000000000010',
    messageId: Option.none(),
    fileName: 'report.pdf',
    mediaType: 'application/pdf',
    size: 1024,
    createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.000Z'),
  }
  const decode = Schema.decodeUnknownExit(Attachment)

  it.each(['application/pdf', 'image/svg+xml', 'application/vnd.ms-excel'])(
    'decodes the media type %j',
    (mediaType) => {
      assert.isTrue(Exit.isSuccess(decode({ ...encoded, mediaType })))
    },
  )

  it('rejects an empty file name', () => {
    assert.isTrue(Exit.isFailure(decode({ ...encoded, fileName: '' })))
  })

  it.each(['pdf', 'application/', '/pdf', 'image/png extra'])(
    'rejects the media type %j',
    (mediaType) => {
      assert.isTrue(Exit.isFailure(decode({ ...encoded, mediaType })))
    },
  )
})

describe('isExpired', () => {
  const unbound = buildAttachment({
    id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
    userId: UserId.make('0192d4e0-7b3a-7c00-8000-000000000010'),
    fileName: FileName.make('photo.png'),
    mediaType: MediaType.make('image/png'),
    size: FileSize.make(1024),
    createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.000Z'),
  })

  it.each([
    { now: '2026-10-18T23:59:59.999Z', expired: false },
    { now: '2026-10-19T00:00:00.000Z', expired: true },
  ])('an unbound attachment made at 2026-10-18T00:00Z at $now: $expired', ({ now, expired }) => {
    assert.strictEqual(isExpired(DateTime.makeUnsafe(now))(unbound), expired)
  })

  it('never expires a bound attachment, however old', () => {
    const bound = new Attachment({
      ...unbound,
      messageId: Option.some(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000031')),
    })

    assert.isFalse(isExpired(DateTime.makeUnsafe('2027-10-18T00:00:00.000Z'))(bound))
  })
})
