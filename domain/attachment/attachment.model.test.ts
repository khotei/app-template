import { assert, describe, it } from '@effect/vitest'
import { DateTime, Exit, Option, Schema } from 'effect'

import { Attachment } from '#domain/attachment/attachment.model'

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

  it.each([-1, 1.5])('rejects the size %j', (size) => {
    assert.isTrue(Exit.isFailure(decode({ ...encoded, size })))
  })

  it.each(['pdf', 'application/', '/pdf', 'image/png extra'])(
    'rejects the media type %j',
    (mediaType) => {
      assert.isTrue(Exit.isFailure(decode({ ...encoded, mediaType })))
    },
  )
})
