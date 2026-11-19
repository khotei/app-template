import { assert, describe, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'

import { assertSchemaEquals, epoch } from '@app-template/packages/testing'

import { AttachmentId } from '#chat/domain/attachment.id'
import { ChatId, MessageId } from '#chat/domain/chat.id'
import { MessageInputInvalidError } from '#chat/domain/message.error'
import { buildMessage, ensureMessageInput, MessageFields } from '#chat/domain/message.model'

const attachmentId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000003')

describe('ensureMessageInput', () => {
  it.effect.each([{ text: '' }, { text: '  \n\t ' }])(
    'rejects the blank text $text without attachments',
    ({ text }) =>
      Effect.gen(function* () {
        const error = yield* ensureMessageInput({ text, attachmentIds: [] }).pipe(Effect.flip)

        assertSchemaEquals(MessageInputInvalidError, error, new MessageInputInvalidError())
      }),
  )

  it.effect('rejects an attachment id given twice', () =>
    Effect.gen(function* () {
      const error = yield* ensureMessageInput({
        text: 'Look',
        attachmentIds: [attachmentId, attachmentId],
      }).pipe(Effect.flip)

      assertSchemaEquals(MessageInputInvalidError, error, new MessageInputInvalidError())
    }),
  )

  it.effect('accepts an attachment without text', () =>
    ensureMessageInput({ text: ' ', attachmentIds: [attachmentId] }),
  )

  it.effect('accepts text without attachments', () =>
    ensureMessageInput({ text: 'Hello', attachmentIds: [] }),
  )
})

describe('MessageFields', () => {
  it('rejects a text holding U+0000, which Postgres refuses', () => {
    assert.isFalse(Schema.is(MessageFields.fields.text)('a\u0000b'))
  })
})

describe('buildMessage', () => {
  it.each([
    { author: 'user', text: 'Hello', built: 'Hello' },
    { author: 'assistant', text: 'a\u0000b', built: 'ab' },
  ] as const)("builds the $author's message by its author's builder", ({ author, text, built }) => {
    const message = buildMessage({
      id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030'),
      chatId: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000020'),
      text,
      createdAt: epoch,
      author,
    })

    assert.deepStrictEqual([message.author, message.text], [author, built])
  })
})
