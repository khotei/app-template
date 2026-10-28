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

const selectOutbox = Effect.flatMap(
  SqlClient.SqlClient,
  (client) => client`SELECT queue FROM outbox`,
).pipe(Effect.orDie)

describe('SendMessageUseCase', () => {
  it.live(
    'a send whose reply insert is refused leaves no message, no bind, no chat change and no job',
    () =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const client = yield* SqlClient.SqlClient
        const photo = yield* upload(owner)
        // The reply is the write after the user message, its bind and the chat's `updatedAt`.
        yield* Effect.orDie(
          client.unsafe(
            `ALTER TABLE messages ADD CONSTRAINT refuse_reply CHECK (author <> 'assistant')`,
          ),
        )

        const exit = yield* Effect.exit(
          sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] }),
        )

        assert.isTrue(Exit.hasDies(exit))
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [photo])
        assertEquals(yield* selectChat(chat.id), Option.some(chat))
        assert.deepStrictEqual(yield* selectOutbox, [])
      }).pipe(Effect.provide(ChatPgTest)),
  )
})
