import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import { maxTitleLength } from '@app-template/kernel/data'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatId, MessageId } from '#chat/domain/chat.id'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { buildAssistantMessage, Message } from '#chat/domain/message.model'
import type { RunFields } from '#chat/domain/run-fields.model'
import { ChatFromEntity } from '#chat/services/chat.mapper'
import { encodeMessage, MessageFromEntity } from '#chat/services/message.mapper'
import { firstMessage, owner, queuedRun } from '#testing/chat/chat.test-fixture'

const chat = new Chat({
  id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000101'),
  userId: owner,
  title: Option.some(ChatTitle.make('a'.repeat(maxTitleLength))),
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
  updatedAt: DateTime.makeUnsafe('2026-10-18T00:00:01.456Z'),
  attachments: [],
  run: Option.none(),
})

describe('ChatFromEntity', () => {
  it.effect.each([
    { name: 'no Run', run: Option.none<RunFields>() },
    { name: 'its newest Run', run: Option.some(queuedRun) },
  ])('encodes a title of the maximum length for chats and reads it back with $name', ({ run }) =>
    Effect.gen(function* () {
      const written = new Chat({ ...chat, run })

      const row = yield* Schema.encodeEffect(ChatFromEntity)(written)
      const read = yield* Schema.decodeUnknownEffect(ChatFromEntity)(row)

      assertSchemaEquals(Chat, read, written)
    }),
  )
})

describe('MessageFromEntity', () => {
  it.effect.each([
    { name: 'the user', message: firstMessage },
    {
      name: 'the assistant',
      message: buildAssistantMessage({
        id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000201'),
        chatId: chat.id,
        text: 'hello',
        createdAt: chat.createdAt,
      }),
    },
  ])('encodes a message by $name for messages and reads it back', ({ message }) =>
    Effect.gen(function* () {
      const row = yield* encodeMessage(message)
      const read = yield* Schema.decodeUnknownEffect(MessageFromEntity)({ ...row, attachments: [] })

      assertSchemaEquals(Message, read, message)
    }),
  )
})
