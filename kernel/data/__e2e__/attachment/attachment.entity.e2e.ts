import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { flipSqlError } from '@app-template/packages/db/testing/e2e'

import { attachments } from '#kernel/data/attachment/attachment.table'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

const userId = '0192d4e0-7b3a-7c00-8000-000000000090'

const attachment = {
  id: '0192d4e0-7b3a-7c00-8000-000000000093',
  userId,
  messageId: null,
  chatId: null,
  fileName: 'notes.txt',
  mediaType: 'text/plain',
  size: 42,
  createdAt: new Date('2026-10-18T00:00:00.123Z'),
} satisfies typeof attachments.$inferInsert

describe('attachments', () => {
  it.effect.each([
    { name: 'an empty file name', check: 'attachments_file_name_check', fields: { fileName: '' } },
    {
      name: 'a media type without a subtype',
      check: 'attachments_media_type_check',
      fields: { mediaType: 'text' },
    },
    { name: 'a negative size', check: 'attachments_size_check', fields: { size: -1 } },
    {
      name: 'a chat without a message',
      check: 'attachments_message_id_chat_id_check',
      fields: { chatId: '0192d4e0-7b3a-7c00-8000-000000000094' },
    },
  ])('refuses $name through its check', ({ check, fields }) =>
    Effect.gen(function* () {
      const db = yield* Db

      yield* db.insert(users).values({ id: userId, createdAt: new Date(0) })
      const error = yield* flipSqlError(db.insert(attachments).values({ ...attachment, ...fields }))

      assert.strictEqual(error.reason._tag, 'ConstraintError')
      assert.include(String(error.reason.cause), check)
    }).pipe(Effect.provide(DbTest)),
  )
})
