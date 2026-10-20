import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { AttachmentId } from '#domain/attachment/attachment.id'
import {
  ChatBusyError,
  MessageInputInvalidError,
  MessageStageInvalidError,
} from '#domain/chat/chat.error'
import { ChatId, MessageId } from '#domain/chat/chat.id'
import {
  Chat,
  ChatTitle,
  Message,
  MessageFailure,
  type MessageStage,
} from '#domain/chat/chat.model'
import {
  buildAssistantMessage,
  buildChat,
  buildUserMessage,
  byLatestUpdate,
  completeMessage,
  ensureChatAcceptsMessage,
  ensureMessageInput,
  failMessage,
  generateMessage,
  isActiveMessage,
  isInChat,
  isTitledChat,
  prepareMessage,
} from '#domain/chat/chat.service'
import { UserId } from '#domain/user/user.id'

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
  attachmentIds: [],
  createdAt,
})

const untitledChat = buildChat({
  id: chatId,
  userId: UserId.make('0192d4e0-7b3a-7c00-8000-000000000004'),
  createdAt,
})

describe('isTitledChat', () => {
  it('holds for a chat with a title', () => {
    assert.isTrue(
      isTitledChat(new Chat({ ...untitledChat, title: Option.some(ChatTitle.make('Trip')) })),
    )
  })

  it('does not hold for an untitled chat', () => {
    assert.isFalse(isTitledChat(untitledChat))
  })
})

describe('byLatestUpdate', () => {
  it('orders the most recently updated chat first', () => {
    const updated = new Chat({ ...untitledChat, updatedAt: later })

    assertEquals(Arr.sort([untitledChat, updated], byLatestUpdate), [updated, untitledChat])
  })
})

describe('isInChat', () => {
  it('holds for a message of the chat and not for one of another chat', () => {
    const elsewhere = new Message({
      ...userMessage,
      chatId: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000005'),
    })

    assert.isTrue(isInChat(chatId)(userMessage))
    assert.isFalse(isInChat(chatId)(elsewhere))
  })
})

describe('isActiveMessage', () => {
  it.each(activeStages)('holds for an assistant message that is %s', (stage) => {
    assert.isTrue(isActiveMessage(assistantAt(stage)))
  })

  it.each(['completed', 'failed'] as const)(
    'does not hold for an assistant message that is %s',
    (stage) => {
      assert.isFalse(isActiveMessage(assistantAt(stage)))
    },
  )

  it('does not hold for a user message', () => {
    assert.isFalse(isActiveMessage(userMessage))
  })
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
        const error = yield* Effect.flip(ensureChatAcceptsMessage(Option.some(assistantAt(stage))))

        assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chatId }))
      }),
  )
})

describe('ensureMessageInput', () => {
  it.effect.each(['', '  \n\t '])('rejects the blank text %j without attachments', (text) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(ensureMessageInput({ text, attachmentIds: [] }))

      assertSchemaEquals(MessageInputInvalidError, error, new MessageInputInvalidError())
    }),
  )

  it.effect('rejects an attachment id given twice', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        ensureMessageInput({ text: 'Look', attachmentIds: [attachmentId, attachmentId] }),
      )

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

describe('buildUserMessage', () => {
  it('builds a completed user message carrying its text and attachments', () => {
    const message = buildUserMessage({
      id: messageId,
      chatId,
      text: 'Look at this',
      attachmentIds: [attachmentId],
      createdAt,
    })

    assert.strictEqual(message.author, 'user')
    assert.strictEqual(message.stage, 'completed')
    assert.strictEqual(message.text, 'Look at this')
    assert.deepStrictEqual(message.attachmentIds, [attachmentId])
    assert.isTrue(Option.isNone(message.error))
  })
})

describe('buildAssistantMessage', () => {
  it('builds a queued assistant message with empty text', () => {
    const message = buildAssistantMessage({ id: messageId, chatId, createdAt })

    assert.strictEqual(message.author, 'assistant')
    assert.strictEqual(message.stage, 'queued')
    assert.strictEqual(message.text, '')
    assert.strictEqual(message.updatedAt, createdAt)
  })
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

  it.effect('keeps the cause out of the user-facing sentence', () =>
    Effect.gen(function* () {
      const failed = yield* failMessage(assistantAt('generating'), {
        reason: 'ReplyFailed',
        cause,
        at: later,
      })
      const error = Option.getOrThrow(failed.error)

      assert.notInclude(error.message, cause)
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
