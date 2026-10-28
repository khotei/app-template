import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Duration, Effect, Layer, Option } from 'effect'

import { assertSchemaEquals, sortById } from '@app-template/testing'

import { ChatBusyError } from '#domain/chat/chat.error'
import { ChatService } from '#domain/chat/chat.service'
import {
  MessageMovedError,
  MessageNotFoundError,
  MessageStageInvalidError,
} from '#domain/chat/message.error'
import {
  buildAssistantMessage,
  buildUserMessage,
  type Message,
  MessageFailure,
} from '#domain/chat/message.model'
import { MessageService } from '#domain/chat/message.service'
import { ask, chat, epoch, unknownMessageId } from '#domain/testing/chat.test-fixture'
import { ChatTest, selectMessages, send } from '#domain/testing/chat.test-layer'
import { owner, stranger } from '#domain/testing/user.test-fixture'

const ChatServicesTest = ChatTest.pipe(Layer.provide(BunCrypto.layer))

const later = DateTime.addDuration(epoch, Duration.seconds(1))

/** A fresh send whose reply is taken to `preparing`, as the worker does. */
const prepareReply = Effect.gen(function* () {
  const service = yield* MessageService
  const { userMessage, assistantMessage } = yield* send(owner, chat.id, 'Lisbon?')
  const prepared = yield* service.prepare(assistantMessage, later)
  return { userMessage, prepared }
})

type Move = (
  service: MessageService['Service'],
  message: Message,
) => Effect.Effect<Message, MessageStageInvalidError | MessageMovedError>

const moves = [
  { name: 'prepare', move: (service, message) => service.prepare(message, later) },
  { name: 'generate', move: (service, message) => service.generate(message, later) },
  {
    name: 'complete',
    move: (service, message) => service.complete(message, { text: 'Sure.', at: later }),
  },
  {
    name: 'fail',
    move: (service, message) =>
      service.fail(message, { reason: 'ReplyFailed', cause: 'boom', at: later }),
  },
] as const satisfies ReadonlyArray<{ readonly name: string; readonly move: Move }>

describe('MessageService', () => {
  it.effect('addUserMessage and addAssistantMessage store the question and its queued reply', () =>
    Effect.gen(function* () {
      const chats = yield* ChatService
      const service = yield* MessageService
      const sendable = yield* chats.findSendable(owner, chat.id, ask('Lisbon?'))

      const userMessage = yield* service.addUserMessage(sendable)
      const assistantMessage = yield* service.addAssistantMessage(sendable)

      assertEquals(
        userMessage,
        buildUserMessage({
          id: userMessage.id,
          chatId: chat.id,
          text: 'Lisbon?',
          createdAt: sendable.at,
        }),
      )
      assertEquals(
        assistantMessage,
        buildAssistantMessage({ id: assistantMessage.id, chatId: chat.id, createdAt: sendable.at }),
      )
      assertEquals(
        sortById(yield* selectMessages(chat.id)),
        sortById([userMessage, assistantMessage]),
      )
    }).pipe(Effect.provide(ChatServicesTest)),
  )

  it.effect('addAssistantMessage on a chat that has an active message is ChatBusyError', () =>
    Effect.gen(function* () {
      const chats = yield* ChatService
      const service = yield* MessageService
      const sendable = yield* chats.findSendable(owner, chat.id, ask('Lisbon?'))
      const first = yield* service.addAssistantMessage(sendable)

      const busy = yield* Effect.flip(service.addAssistantMessage(sendable))

      assertSchemaEquals(ChatBusyError, busy, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* selectMessages(chat.id), [first])
    }).pipe(Effect.provide(ChatServicesTest)),
  )

  it.effect('get returns the stored message', () =>
    Effect.gen(function* () {
      const service = yield* MessageService
      const { userMessage } = yield* send(owner, chat.id, 'Lisbon?')

      assertEquals(yield* service.get(owner, chat.id, userMessage.id), {
        message: userMessage,
        attachments: [],
      })
    }).pipe(Effect.provide(ChatServicesTest)),
  )

  it.effect(
    "get of an unknown id, of another chat's message or of a stranger's chat is MessageNotFoundError",
    () =>
      Effect.gen(function* () {
        const chats = yield* ChatService
        const service = yield* MessageService
        const other = yield* chats.create(owner)
        const { userMessage } = yield* send(owner, other.id, 'Lisbon?')

        const elsewhere = yield* Effect.flip(service.get(owner, chat.id, userMessage.id))
        const foreign = yield* Effect.flip(service.get(stranger, other.id, userMessage.id))
        const missing = yield* Effect.flip(service.get(owner, chat.id, unknownMessageId))

        assertSchemaEquals(
          MessageNotFoundError,
          elsewhere,
          new MessageNotFoundError({ id: userMessage.id }),
        )
        assertSchemaEquals(
          MessageNotFoundError,
          foreign,
          new MessageNotFoundError({ id: userMessage.id }),
        )
        assertSchemaEquals(
          MessageNotFoundError,
          missing,
          new MessageNotFoundError({ id: unknownMessageId }),
        )
      }).pipe(Effect.provide(ChatServicesTest)),
  )

  it.effect('prepare, generate, snapshot and complete store each stage in turn', () =>
    Effect.gen(function* () {
      const service = yield* MessageService
      const { userMessage, assistantMessage } = yield* send(owner, chat.id, 'Lisbon?')

      const prepared = yield* service.prepare(assistantMessage, later)
      const generating = yield* service.generate(prepared, later)
      const snapshot = yield* service.snapshot(generating, 'Sure', later)
      const completed = yield* service.complete(snapshot, { text: 'Sure.', at: later })

      assert.deepStrictEqual(
        [prepared.stage, generating.stage, snapshot.stage, completed.stage],
        ['preparing', 'generating', 'generating', 'completed'],
      )
      assert.deepStrictEqual([snapshot.text, completed.text], ['Sure', 'Sure.'])
      assertEquals(sortById(yield* selectMessages(chat.id)), sortById([userMessage, completed]))
    }).pipe(Effect.provide(ChatServicesTest)),
  )

  it.effect('fail stores the failure with its user-facing sentence', () =>
    Effect.gen(function* () {
      const service = yield* MessageService
      const { userMessage, prepared } = yield* prepareReply

      const failed = yield* service.fail(prepared, {
        reason: 'ReplyFailed',
        cause: 'boom',
        at: later,
      })

      assertEquals(
        failed.error,
        Option.some(
          new MessageFailure({
            reason: 'ReplyFailed',
            message: 'The assistant could not reply. Please try again.',
            cause: 'boom',
          }),
        ),
      )
      assert.strictEqual(failed.stage, 'failed')
      assertEquals(sortById(yield* selectMessages(chat.id)), sortById([userMessage, failed]))
    }).pipe(Effect.provide(ChatServicesTest)),
  )

  it.effect('prepare of a completed message is MessageStageInvalidError and writes nothing', () =>
    Effect.gen(function* () {
      const service = yield* MessageService
      const { userMessage } = yield* send(owner, chat.id, 'Lisbon?')
      const stored = yield* selectMessages(chat.id)

      const error = yield* Effect.flip(service.prepare(userMessage, later))

      assertSchemaEquals(
        MessageStageInvalidError,
        error,
        new MessageStageInvalidError({ id: userMessage.id, from: 'completed', to: 'preparing' }),
      )
      assertEquals(yield* selectMessages(chat.id), stored)
    }).pipe(Effect.provide(ChatServicesTest)),
  )

  it.effect.each(moves)('$name after the stored message moved is MessageMovedError', ({ move }) =>
    Effect.gen(function* () {
      const service = yield* MessageService
      const { prepared } = yield* prepareReply
      yield* service.complete(prepared, { text: 'Sure.', at: later })
      const stored = yield* selectMessages(chat.id)

      const error = yield* Effect.flip(move(service, prepared))

      assertSchemaEquals(
        MessageMovedError,
        error,
        new MessageMovedError({ id: prepared.id, stage: 'preparing' }),
      )
      assertEquals(yield* selectMessages(chat.id), stored)
    }).pipe(Effect.provide(ChatServicesTest)),
  )

  it.effect('snapshot writes the text only while the stored message is generating', () =>
    Effect.gen(function* () {
      const service = yield* MessageService
      const { userMessage, prepared } = yield* prepareReply

      const early = yield* Effect.flip(service.snapshot(prepared, 'Su', later))
      const generating = yield* service.generate(prepared, later)
      const snapshot = yield* service.snapshot(generating, 'Sure', later)
      const completed = yield* service.complete(generating, { text: 'Sure.', at: later })
      const late = yield* Effect.flip(service.snapshot(snapshot, 'Sure!', later))

      assertSchemaEquals(
        MessageMovedError,
        early,
        new MessageMovedError({ id: prepared.id, stage: 'generating' }),
      )
      assertSchemaEquals(
        MessageMovedError,
        late,
        new MessageMovedError({ id: prepared.id, stage: 'generating' }),
      )
      assertEquals(sortById(yield* selectMessages(chat.id)), sortById([userMessage, completed]))
    }).pipe(Effect.provide(ChatServicesTest)),
  )
})
