import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { AttachmentId } from '#domain/attachment/attachment.id'
import { ChatId, MessageId } from '#domain/chat/chat.id'
import { MessageInputInvalidError, MessageStatusInvalidError } from '#domain/chat/message.error'
import {
  buildAssistantMessage,
  buildUserMessage,
  completeMessage,
  ensureMessageInput,
  failMessage,
  generateMessage,
  Message,
  MessageFailure,
  type MessageStatus,
  prepareMessage,
} from '#domain/chat/message.model'
import { provenance } from '#domain/testing/chat.test-fixture'

const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000001')
const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000002')
const attachmentId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000003')
const createdAt = DateTime.makeUnsafe('2026-10-17T00:00:00.000Z')
const later = DateTime.makeUnsafe('2026-10-17T00:00:01.000Z')

const assistantAt = (status: MessageStatus) =>
  new Message({ ...buildAssistantMessage({ id: messageId, chatId, createdAt }), status })

const activeStages = ['queued', 'preparing', 'generating'] as const

const userMessage = buildUserMessage({
  id: messageId,
  chatId,
  text: 'Hello',
  createdAt,
})

describe('ensureMessageInput', () => {
  it.effect.each(['', '  \n\t '])('rejects the blank text %j without attachments', (text) =>
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

const inactiveMessages = [
  ['a user message', userMessage],
  ['a completed assistant message', assistantAt('done')],
  ['a failed assistant message', assistantAt('failed')],
] as const

const withLeftovers = (status: MessageStatus) =>
  new Message({
    ...assistantAt(status),
    text: 'Half a reply',
    error: Option.some(
      new MessageFailure({ reason: 'ReplyFailed', message: 'Earlier failure', cause: 'timeout' }),
    ),
  })

const expectStageInvalid = (
  transition: Effect.Effect<Message, MessageStatusInvalidError>,
  message: Message,
  to: MessageStatus,
) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(transition)

    assertSchemaEquals(
      MessageStatusInvalidError,
      error,
      new MessageStatusInvalidError({ id: message.id, from: message.status, to }),
    )
  })

describe('prepareMessage', () => {
  it.effect.each(activeStages)(
    'moves a %s message to preparing with empty text and no error',
    (status) =>
      Effect.gen(function* () {
        const prepared = yield* prepareMessage(withLeftovers(status), later)

        assert.strictEqual(prepared.status, 'preparing')
        assert.strictEqual(prepared.text, '')
        assert.isTrue(Option.isNone(prepared.error))
        assert.strictEqual(prepared.updatedAt, later)
      }),
  )

  it.effect('keeps the provenance of the last request', () =>
    Effect.gen(function* () {
      const asked = new Message({
        ...assistantAt('generating'),
        provenance: Option.some(provenance),
      })

      const prepared = yield* prepareMessage(asked, later)

      assert.deepStrictEqual(prepared.provenance, Option.some(provenance))
    }),
  )

  it.effect.each(inactiveMessages)('fails MessageStatusInvalidError for %s', ([, message]) =>
    expectStageInvalid(prepareMessage(message, later), message, 'preparing'),
  )
})

describe('generateMessage', () => {
  it.effect('moves a preparing message to generating with the provenance of its request', () =>
    Effect.gen(function* () {
      const generating = yield* generateMessage(assistantAt('preparing'), { provenance, at: later })

      assert.strictEqual(generating.status, 'generating')
      assert.deepStrictEqual(generating.provenance, Option.some(provenance))
      assert.strictEqual(generating.updatedAt, later)
    }),
  )

  it.effect.each([
    ['a queued assistant message', assistantAt('queued')],
    ['a generating assistant message', assistantAt('generating')],
    ['a user message at preparing', new Message({ ...userMessage, status: 'preparing' })],
    ...inactiveMessages,
  ] as const)('fails MessageStatusInvalidError for %s', ([, message]) =>
    expectStageInvalid(generateMessage(message, { provenance, at: later }), message, 'generating'),
  )
})

describe('completeMessage', () => {
  it.effect.each(activeStages)(
    'moves a %s message to completed with the final text and no error',
    (status) =>
      Effect.gen(function* () {
        const completed = yield* completeMessage(withLeftovers(status), {
          text: 'Hello there',
          at: later,
        })

        assert.strictEqual(completed.status, 'done')
        assert.strictEqual(completed.text, 'Hello there')
        assert.isTrue(Option.isNone(completed.error))
        assert.strictEqual(completed.updatedAt, later)
      }),
  )

  it.effect.each(inactiveMessages)('fails MessageStatusInvalidError for %s', ([, message]) =>
    expectStageInvalid(
      completeMessage(message, { text: 'Hello there', at: later }),
      message,
      'done',
    ),
  )
})

describe('failMessage', () => {
  const cause = 'Provider returned 529: overloaded'

  it.effect.each(activeStages)(
    'moves a %s message to failed with the fixed sentence and the cause',
    (status) =>
      Effect.gen(function* () {
        const failed = yield* failMessage(assistantAt(status), {
          reason: 'ReplyFailed',
          cause,
          at: later,
        })

        assert.strictEqual(failed.status, 'failed')
        assert.strictEqual(failed.updatedAt, later)
        assert.deepStrictEqual(
          failed.error.pipe(Option.map((error) => ({ ...error }))),
          Option.some({
            reason: 'ReplyFailed' as const,
            message: 'The assistant could not reply. Please try again.',
            cause,
          }),
        )
      }),
  )

  it.effect.each([
    { reason: 'ReplyFailed', sentence: 'The assistant could not reply. Please try again.' },
    { reason: 'ReplyRefused', sentence: 'The assistant declined to answer this message.' },
  ] as const)('gives $reason a sentence of its own', ({ reason, sentence }) =>
    Effect.gen(function* () {
      const failed = yield* failMessage(assistantAt('generating'), { reason, cause, at: later })

      assert.deepStrictEqual(
        failed.error.pipe(Option.map((error) => [error.reason, error.message])),
        Option.some([reason, sentence]),
      )
    }),
  )

  it.effect.each(inactiveMessages)('fails MessageStatusInvalidError for %s', ([, message]) =>
    expectStageInvalid(
      failMessage(message, { reason: 'ReplyFailed', cause, at: later }),
      message,
      'failed',
    ),
  )
})
