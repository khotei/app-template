import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Exit, Option } from 'effect'
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
  // Live: the chat's `updatedAt` staying put means something only while the clock moves.
  it.live(
    'a send whose title job is refused leaves no message, no bind, no chat change and no job',
    () =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const client = yield* SqlClient.SqlClient
        const photo = yield* upload(owner)
        // The title job is the last write of the send that opens a chat; all the others precede it.
        yield* Effect.orDie(
          client.unsafe(
            `ALTER TABLE outbox ADD CONSTRAINT refuse_title CHECK (queue <> 'chat-title')`,
          ),
        )

        const exit = yield* Effect.exit(
          sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] }),
        )

        assert.isTrue(Exit.hasDies(exit))
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [photo])
        assertEquals(yield* selectChat(chat.id), Option.some(chat))
        assertEquals(yield* selectOutbox, [])
      }).pipe(Effect.provide(ChatPgTest)),
  )
})
