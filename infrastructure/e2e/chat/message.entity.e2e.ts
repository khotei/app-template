import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Option, Schema } from 'effect'

import { Chat, ChatId, Message, MessageId } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { MessageFromRow } from '#infrastructure/attachment/attachment.entity'
import { withAttachments } from '#infrastructure/chat/message.entity'
import { Db } from '#infrastructure/db/db.client'
import { DbTest, flipSqlError } from '#infrastructure/db/testing/db.test-layer'
import { insertChat, insertMessage, insertUser } from '#infrastructure/testing/rows.test-util'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')
const updatedAt = DateTime.makeUnsafe('2026-10-18T00:00:01.456Z')

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000060')
const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000061')

const chat = new Chat({
  id: chatId,
  userId,
  title: Option.none(),
  status: 'idle',
  createdAt,
  updatedAt,
})

const message = (id: MessageId, fields: Partial<Pick<Message, 'status'>>) =>
  new Message({
    id,
    chatId,
    author: 'assistant',
    status: 'queued',
    text: '',
    error: Option.none(),
    createdAt,
    updatedAt,
    attachments: [],
    ...fields,
  })

const insertChatOfUser = insertUser(userId).pipe(Effect.andThen(insertChat(chat)))

const selectMessages = Db.use((db) =>
  db.query.messages.findMany({ orderBy: { id: 'asc' }, with: withAttachments }),
).pipe(Effect.flatMap(Schema.decodeEffect(Schema.Array(MessageFromRow))))

describe('messages', () => {
  it.effect('refuses a second active reply in a chat through the partial unique index', () =>
    Effect.gen(function* () {
      const queued = message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000076'), {})
      const generating = message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000077'), {
        status: 'generating',
      })

      yield* insertChatOfUser
      yield* insertMessage(queued)
      const error = yield* flipSqlError(insertMessage(generating))

      assert.strictEqual(error.reason._tag, 'UniqueViolation')
      assert.include(String(error.reason.cause), 'messages_chat_id_active_index')
    }).pipe(Effect.provide(DbTest)),
  )

  it.effect('accepts an active reply beside a completed one', () =>
    Effect.gen(function* () {
      const completed = message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000078'), {
        status: 'done',
      })
      const queued = message(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000079'), {})

      yield* insertChatOfUser
      yield* insertMessage(completed)
      yield* insertMessage(queued)
      const selected = yield* selectMessages

      assertSchemaEquals(Schema.Array(Message), selected, [completed, queued])
    }).pipe(Effect.provide(DbTest)),
  )
})
