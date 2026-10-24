import { assert } from '@effect/vitest'
import { Effect, Schema } from 'effect'

import {
  ChatNotFoundError,
  failMessage,
  type MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import { UserUnknownError } from '@app-template/domain/user'
import { MessageRepositoryPg } from '@app-template/infrastructure/chat'
import { assertSchemaEquals, describeOnMiniStack } from '@app-template/testing'

import { openChat, withApi } from '#api/testing/api.harness'

const hello = { text: 'Hello', attachmentIds: [] }

/** Settles a reply as the worker does once its attempts are exhausted. */
const failReply = (id: MessageId) =>
  Effect.gen(function* () {
    const messages = yield* MessageRepository
    const reply = yield* Effect.flatMap(messages.selectById(id), Effect.fromOption)
    yield* messages.update(
      yield* failMessage(reply, {
        reason: 'ReplyFailed',
        cause: 'the provider timed out',
        at: reply.updatedAt,
      }),
    )
  }).pipe(Effect.orDie, Effect.provide(MessageRepositoryPg))

describeOnMiniStack('chats', (it) => {
  it.effect('GET /chats without a cookie is 401 UserUnknownError', () =>
    withApi((api, { http }) =>
      Effect.gen(function* () {
        const response = yield* http.get('/chats')
        const error = yield* Effect.flip(api.chats.list())

        assert.strictEqual(response.status, 401)
        assert.deepStrictEqual(yield* response.json, { _tag: 'UserUnknownError' })
        assertSchemaEquals(UserUnknownError, error, new UserUnknownError())
      }),
    ),
  )

  it.effect(
    'POST /chats/:chatId/messages is 202 with a completed user message and a queued reply',
    () =>
      withApi((api) =>
        Effect.gen(function* () {
          const chat = yield* openChat(api)
          const [sent, response] = yield* api.chats.send({
            params: { chatId: chat.id },
            payload: hello,
            responseMode: 'decoded-and-response',
          })

          assert.strictEqual(response.status, 202)
          assert.deepInclude(sent.userMessage, {
            chatId: chat.id,
            author: 'user',
            stage: 'completed',
            text: 'Hello',
            attachments: [],
          })
          assert.deepInclude(sent.assistantMessage, {
            chatId: chat.id,
            author: 'assistant',
            stage: 'queued',
            text: '',
            attachments: [],
          })
        }),
      ),
  )

  it.effect("another user's chat is 404 ChatNotFoundError, as if it did not exist", () =>
    withApi((api, { browse }) =>
      Effect.gen(function* () {
        const chat = yield* openChat(api)

        yield* browse((stranger, { http }) =>
          Effect.gen(function* () {
            yield* stranger.users.ensure()

            const response = yield* http.get(`/chats/${chat.id}`)

            assert.strictEqual(response.status, 404)
            assertSchemaEquals(
              ChatNotFoundError,
              yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(ChatNotFoundError)),
              new ChatNotFoundError({ id: chat.id }),
            )
          }),
        )
      }),
    ),
  )

  it.effect('a failed reply carries its reason and message on the wire, never its cause', () =>
    withApi((api, { http }) =>
      Effect.gen(function* () {
        const chat = yield* openChat(api)
        const { assistantMessage } = yield* api.chats.send({
          params: { chatId: chat.id },
          payload: hello,
        })
        yield* failReply(assistantMessage.id)

        const wire = yield* Effect.flatMap(
          http.get(`/chats/${chat.id}/messages/${assistantMessage.id}`),
          (response) => response.json,
        )

        assert.deepInclude(wire, {
          stage: 'failed',
          error: {
            reason: 'ReplyFailed',
            message: 'The assistant could not reply. Please try again.',
          },
        })
      }),
    ),
  )
})
