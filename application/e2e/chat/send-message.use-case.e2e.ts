import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Exit, Option, Order } from 'effect'
import { SqlClient } from 'effect/sql'

import { buildChat, ChatId, ChatRepository } from '@app-template/domain/chat'
import { chat, epoch, owner, upload } from '@app-template/domain/testing'

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
    'of two concurrent sends to one chat, one is stored and the other is refused, keeping nothing',
    () =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        // The loser reads the chat queued (ChatBusyError) or, having read it idle, dies on the
        // status move: both roll it back whole.
        const send = sendMessage.send(owner, chat.id, { text: 'Lisbon?', attachmentIds: [] }).pipe(
          Effect.as('sent'),
          Effect.catchTag('ChatBusyError', () => Effect.succeed('refused')),
          Effect.catchDefect(() => Effect.succeed('refused')),
        )

        const outcomes = yield* Effect.all([send, send], { concurrency: 'unbounded' })

        assert.deepStrictEqual(Arr.sort(outcomes, Order.String), ['refused', 'sent'])
        assert.strictEqual((yield* selectMessages(chat.id)).length, 2)
      }).pipe(Effect.provide(ChatPgTest)),
  )

  it.effect(
    'of two concurrent sends binding one file to two chats, one binds it and the other is AttachmentBoundError',
    () =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const chats = yield* ChatRepository
        const other = buildChat({
          id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000022'),
          userId: owner,
          createdAt: epoch,
        })
        yield* chats.insert(other)
        const photo = yield* upload(owner)
        const send = (chatId: ChatId) =>
          sendMessage.send(owner, chatId, { text: 'Look', attachmentIds: [photo.id] }).pipe(
            Effect.as('sent'),
            Effect.catchTag('AttachmentBoundError', () => Effect.succeed('bound')),
          )

        const outcomes = yield* Effect.all([send(chat.id), send(other.id)], {
          concurrency: 'unbounded',
        })

        assert.deepStrictEqual(Arr.sort(outcomes, Order.String), ['bound', 'sent'])
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
        // The title job is the last write of a chat's first send; all the others precede it.
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
