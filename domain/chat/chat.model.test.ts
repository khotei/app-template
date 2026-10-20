import { assert, describe, it } from '@effect/vitest'
import { DateTime, Exit, Option, Schema } from 'effect'

import { ChatId, MessageId } from '#domain/chat/chat.id'
import { ActiveMessageStage, ChatTitle, Message } from '#domain/chat/chat.model'

describe('ChatTitle', () => {
  it.each(['Trip', 'a'.repeat(120)])('accepts %j', (title) => {
    assert.isTrue(Schema.is(ChatTitle)(title))
  })

  it.each(['', '  ', ' Trip', 'a'.repeat(121)])('rejects %j', (title) => {
    assert.isFalse(Schema.is(ChatTitle)(title))
  })
})

describe('ActiveMessageStage', () => {
  it.each(['queued', 'preparing', 'generating'])('decodes %j', (stage) => {
    assert.isTrue(Schema.is(ActiveMessageStage)(stage))
  })

  it.each(['completed', 'failed'])('rejects the terminal stage %j', (stage) => {
    assert.isFalse(Schema.is(ActiveMessageStage)(stage))
  })
})

describe('Message', () => {
  const createdAt = DateTime.makeUnsafe('2026-10-17T00:00:00.000Z')
  const withAuthor = (author: string) => ({
    id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000002'),
    chatId: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000001'),
    author,
    stage: 'completed',
    text: 'Hello',
    attachmentIds: [],
    error: Option.none(),
    createdAt,
    updatedAt: createdAt,
  })

  it.each(['user', 'assistant'])('decodes the author %j', (author) => {
    assert.isTrue(Exit.isSuccess(Schema.decodeUnknownExit(Message)(withAuthor(author))))
  })

  it('rejects an author outside user and assistant', () => {
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(Message)(withAuthor('moderator'))))
  })
})
