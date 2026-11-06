import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema, type Types } from 'effect'

import { maxTitleLength } from '@app-template/kernel/data'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatId, MessageId } from '#chat/domain/chat.id'
import { Chat, ChatStatus, ChatTitle } from '#chat/domain/chat.model'
import { Message, MessageStatus } from '#chat/domain/message.model'
import {
  ChatFromEntity,
  encodeChat,
  encodeMessage,
  MessageFromEntity,
} from '#chat/services/chat.mapper'
import { owner } from '#testing/chat/chat.test-fixture'

const chat = new Chat({
  id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000101'),
  userId: owner,
  title: Option.some(ChatTitle.make('a'.repeat(maxTitleLength))),
  status: 'idle',
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
  updatedAt: DateTime.makeUnsafe('2026-10-18T00:00:01.456Z'),
  attachments: [],
})

const message = new Message({
  id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000201'),
  chatId: chat.id,
  author: 'assistant',
  status: 'queued',
  text: 'hello',
  error: Option.none(),
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
  attachments: [],
})

const messageCases: ReadonlyArray<Types.Simplify<Pick<Message, 'author' | 'status'>>> = [
  ...MessageStatus.literals.map((status) => ({ author: 'assistant' as const, status })),
  { author: 'user', status: 'done' },
]

describe('ChatFromEntity', () => {
  it.effect.each(ChatStatus.literals.map((status) => ({ status })))(
    '$status: encodes a title of the maximum length for chats and reads it back',
    ({ status }) =>
      Effect.gen(function* () {
        const written = new Chat({ ...chat, status })

        const row = yield* encodeChat(written)
        const read = yield* Schema.decodeUnknownEffect(ChatFromEntity)({ ...row, attachments: [] })

        assertSchemaEquals(Chat, read, written)
      }),
  )
})

describe('MessageFromEntity', () => {
  it.effect.each(messageCases)(
    '$status: encodes a message by the $author for messages and reads it back',
    ({ author, status }) =>
      Effect.gen(function* () {
        const written = new Message({ ...message, author, status })

        const row = yield* encodeMessage(written)
        const read = yield* Schema.decodeUnknownEffect(MessageFromEntity)({
          ...row,
          attachments: [],
        })

        assertSchemaEquals(Message, read, written)
      }),
  )
})
