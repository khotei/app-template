import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Order, Schema } from 'effect'
import { HttpClient } from 'effect/http'

import {
  ChatBusyError,
  ChatNotFoundError,
  failMessage,
  type MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import { UserUnknownError } from '@app-template/domain/user'
import { ApiClient } from '@app-template/http-api'
import { MessageRepositoryPg } from '@app-template/infrastructure/chat'
import { assertSchemaEquals } from '@app-template/testing'

import { ApiServerTest, ApiTest, layerApiClient } from '#api/testing/api.harness'

const hello = { text: 'Hello', attachmentIds: [] }

/** Registers the jar's user and opens an empty chat of theirs. */
const openChat = Effect.flatMap(ApiClient, (api) =>
  Effect.andThen(api.users.ensure(), api.chats.create()),
)

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
      { stage: reply.stage },
    )
  }).pipe(Effect.orDie, Effect.provide(MessageRepositoryPg))

describe('chats', () => {
  it.effect('GET /chats without a cookie is 401 UserUnknownError', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const http = yield* HttpClient.HttpClient

      const response = yield* http.get('/chats')
      const error = yield* Effect.flip(api.chats.list())

      assert.strictEqual(response.status, 401)
      assert.deepStrictEqual(yield* response.json, { _tag: 'UserUnknownError' })
      assertSchemaEquals(UserUnknownError, error, new UserUnknownError())
    }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    'POST /chats/:chatId/messages is 202 with a completed user message and a queued reply',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const chat = yield* openChat

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
      }).pipe(Effect.provide(ApiTest)),
  )

  it.effect('two concurrent sends to one chat answer one 202 and one 409 ChatBusyError', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const chat = yield* openChat
      const send = api.chats.send({
        params: { chatId: chat.id },
        payload: hello,
        responseMode: 'response-only',
      })

      const responses = yield* Effect.all([send, send], { concurrency: 'unbounded' })

      const statuses = Arr.map(responses, (response) => response.status)
      const busy = yield* Effect.fromOption(
        Arr.findFirst(responses, (response) => response.status === 409),
      )
      assert.deepStrictEqual(Arr.sort(statuses, Order.Number), [202, 409])
      assertSchemaEquals(
        ChatBusyError,
        yield* Effect.flatMap(busy.json, Schema.decodeUnknownEffect(ChatBusyError)),
        new ChatBusyError({ id: chat.id }),
      )
    }).pipe(Effect.provide(ApiTest)),
  )

  it.effect("another user's chat is 404 ChatNotFoundError, as if it did not exist", () =>
    Effect.gen(function* () {
      const chat = yield* Effect.provide(openChat, layerApiClient())
      const [stranger, http] = yield* Effect.provide(
        Effect.zip(ApiClient, HttpClient.HttpClient),
        layerApiClient(),
      )
      yield* stranger.users.ensure()

      const response = yield* http.get(`/chats/${chat.id}`)

      assert.strictEqual(response.status, 404)
      assertSchemaEquals(
        ChatNotFoundError,
        yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(ChatNotFoundError)),
        new ChatNotFoundError({ id: chat.id }),
      )
    }).pipe(Effect.provide(ApiServerTest)),
  )

  it.effect('a failed reply carries its reason and message on the wire, never its cause', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const http = yield* HttpClient.HttpClient
      const chat = yield* openChat
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
    }).pipe(Effect.provide(ApiTest)),
  )
})
