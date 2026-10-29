import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Exit, Option, Order } from 'effect'
import { SqlClient } from 'effect/sql'

import { chat, owner, upload } from '@app-template/domain/testing'

import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  ChatPgTest,
  selectAttachments,
  selectChat,
  selectMessages,
} from '#application/testing/chat.test-layer'

const selectOutbox = SqlClient.SqlClient.use((client) => client`SELECT queue FROM outbox`).pipe(
  Effect.orDie,
)

describe('SendMessageUseCase', () => {
  it.effect(
    'of two concurrent sends to one chat, one is stored and the other is ChatBusyError',
    () =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const send = sendMessage.send(owner, chat.id, { text: 'Lisbon?', attachmentIds: [] }).pipe(
          Effect.as('sent'),
          Effect.catchTag('ChatBusyError', () => Effect.succeed('busy')),
        )

        const outcomes = yield* Effect.all([send, send], { concurrency: 'unbounded' })

        assert.deepStrictEqual(Arr.sort(outcomes, Order.String), ['busy', 'sent'])
        assert.strictEqual((yield* selectMessages(chat.id)).length, 2)
      }).pipe(Effect.provide(ChatPgTest)),
  )

  // Live: the chat's `updatedAt` staying put means something only while the clock moves.
  it.live(
    'a send whose title job is refused leaves no message, no bind, no chat change and no job',
    () =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const client = yield* SqlClient.SqlClient
        const photo = yield* upload(owner)
        // The title job is the last write of the send that opens a chat; all the others precede it.
        yield* client
          .unsafe(`ALTER TABLE outbox ADD CONSTRAINT refuse_title CHECK (queue <> 'chat-title')`)
          .pipe(Effect.orDie)

        const exit = yield* sendMessage
          .send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })
          .pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [photo])
        assertEquals(yield* selectChat(chat.id), Option.some(chat))
        assertEquals(yield* selectOutbox, [])
      }).pipe(Effect.provide(ChatPgTest)),
  )
})
