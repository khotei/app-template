import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { AttachmentId } from '#domain/attachment/attachment.id'
import { ChatBusyError } from '#domain/chat/chat.error'
import { ChatId, MessageId } from '#domain/chat/chat.id'
import { MessageInputInvalidError, MessageStageInvalidError } from '#domain/chat/message.error'
import {
  buildAssistantMessage,
  buildUserMessage,
  completeMessage,
  ensureChatAcceptsMessage,
  ensureMessageInput,
  failMessage,
  generateMessage,
  Message,
  MessageFailure,
  prepareMessage,
} from '#domain/chat/message.model'
import type { MessageStage } from '#domain/chat/message-stage.model'

const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000001')
const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000002')
const attachmentId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000003')
const createdAt = DateTime.makeUnsafe('2026-10-17T00:00:00.000Z')
const later = DateTime.makeUnsafe('2026-10-17T00:00:01.000Z')

const assistantAt = (stage: MessageStage) =>
  new Message({ ...buildAssistantMessage({ id: messageId, chatId, createdAt }), stage })

const activeStages = ['queued', 'preparing', 'generating'] as const

const userMessage = buildUserMessage({
  id: messageId,
  chatId,
  text: 'Hello',
  createdAt,
})

describe('ensureChatAcceptsMessage', () => {
  it.effect.each([
    ['none', Option.none()],
    ['a user message', Option.some(userMessage)],
    ['a completed assistant message', Option.some(assistantAt('completed'))],
    ['a failed assistant message', Option.some(assistantAt('failed'))],
  ] as const)('passes when the current message is %s', ([, current]) =>
    ensureChatAcceptsMessage(current),
  )

  it.effect.each(activeStages)(
    'fails ChatBusyError with the chat id when the current message is a %s assistant message',
    (stage) =>
      Effect.gen(function* () {
        const error = yield* ensureChatAcceptsMessage(Option.some(assistantAt(stage))).pipe(
          Effect.flip,
        )

        assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chatId }))
      }),
  )
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
  ['a completed assistant message', assistantAt('completed')],
  ['a failed assistant message', assistantAt('failed')],
] as const

const withLeftovers = (stage: MessageStage) =>
  new Message({
    ...assistantAt(stage),
    text: 'Half a reply',
    error: Option.some(
      new MessageFailure({ reason: 'ReplyFailed', message: 'Earlier failure', cause: 'timeout' }),
    ),
  })

const expectStageInvalid = (
  transition: Effect.Effect<Message, MessageStageInvalidError>,
  message: Message,
  to: MessageStage,
) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(transition)

    assertSchemaEquals(
      MessageStageInvalidError,
      error,
      new MessageStageInvalidError({ id: message.id, from: message.stage, to }),
    )
  })

describe('prepareMessage', () => {
  it.effect.each(activeStages)(
    'moves a %s message to preparing with empty text and no error',
    (stage) =>
      Effect.gen(function* () {
        const prepared = yield* prepareMessage(withLeftovers(stage), later)

        assert.strictEqual(prepared.stage, 'preparing')
        assert.strictEqual(prepared.text, '')
        assert.isTrue(Option.isNone(prepared.error))
        assert.strictEqual(prepared.updatedAt, later)
      }),
  )

  it.effect.each(inactiveMessages)('fails MessageStageInvalidError for %s', ([, message]) =>
    expectStageInvalid(prepareMessage(message, later), message, 'preparing'),
  )
})

describe('generateMessage', () => {
  it.effect('moves a preparing message to generating', () =>
    Effect.gen(function* () {
      const generating = yield* generateMessage(assistantAt('preparing'), later)

      assert.strictEqual(generating.stage, 'generating')
      assert.strictEqual(generating.updatedAt, later)
    }),
  )

  it.effect.each([
    ['a queued assistant message', assistantAt('queued')],
    ['a generating assistant message', assistantAt('generating')],
    ['a user message at preparing', new Message({ ...userMessage, stage: 'preparing' })],
    ...inactiveMessages,
  ] as const)('fails MessageStageInvalidError for %s', ([, message]) =>
    expectStageInvalid(generateMessage(message, later), message, 'generating'),
  )
})

describe('completeMessage', () => {
  it.effect.each(activeStages)(
    'moves a %s message to completed with the final text and no error',
    (stage) =>
      Effect.gen(function* () {
        const completed = yield* completeMessage(withLeftovers(stage), {
          text: 'Hello there',
          at: later,
        })

        assert.strictEqual(completed.stage, 'completed')
        assert.strictEqual(completed.text, 'Hello there')
        assert.isTrue(Option.isNone(completed.error))
        assert.strictEqual(completed.updatedAt, later)
      }),
  )

  it.effect.each(inactiveMessages)('fails MessageStageInvalidError for %s', ([, message]) =>
    expectStageInvalid(
      completeMessage(message, { text: 'Hello there', at: later }),
      message,
      'completed',
    ),
  )
})

describe('failMessage', () => {
  const cause = 'Provider returned 529: overloaded'

  it.effect.each(activeStages)(
    'moves a %s message to failed with the fixed sentence and the cause',
    (stage) =>
      Effect.gen(function* () {
        const failed = yield* failMessage(assistantAt(stage), {
          reason: 'ReplyFailed',
          cause,
          at: later,
        })

        assert.strictEqual(failed.stage, 'failed')
        assert.strictEqual(failed.updatedAt, later)
        assert.deepStrictEqual(
          Option.map(failed.error, (error) => ({ ...error })),
          Option.some({
            reason: 'ReplyFailed' as const,
            message: 'The assistant could not reply. Please try again.',
            cause,
          }),
        )
      }),
  )

  it.effect.each(inactiveMessages)('fails MessageStageInvalidError for %s', ([, message]) =>
    expectStageInvalid(
      failMessage(message, { reason: 'ReplyFailed', cause, at: later }),
      message,
      'failed',
    ),
  )
})
