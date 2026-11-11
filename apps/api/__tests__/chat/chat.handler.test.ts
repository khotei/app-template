import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Order, Schema } from 'effect'
import { HttpClient } from 'effect/http'

import { failRun } from '@app-template/application/chat'
import { selectRun, updateRun } from '@app-template/application/chat/testing'
import {
  ApiClient,
  ChatBusyError,
  ChatNotFoundError,
  MessageNotFoundError,
  type RunId,
  RunNotFoundError,
  RunNotRetryableError,
  UserUnknownError,
} from '@app-template/http-api'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ApiServerTest, ApiTest, layerApiClient } from '#testing/api.test-layer'

const hello = { text: 'Hello', attachmentIds: [] }

/** Registers the jar's user and opens an empty chat of theirs. */
const openChat = ApiClient.use((api) => api.users.ensure().pipe(Effect.andThen(api.chats.create())))

/** Settles a Run as the worker does once the assistant refuses. */
const refuseRun = (id: RunId) =>
  Effect.gen(function* () {
    const run = yield* selectRun(id).pipe(Effect.flatMap(Effect.fromOption))
    yield* updateRun(
      yield* failRun(run, {
        reason: 'ReplyRefused',
        cause: 'stop_reason refusal',
        at: run.updatedAt,
      }),
    )
  }).pipe(Effect.orDie)

describe('chats', () => {
  it.effect('GET /chats without a cookie is 401 UserUnknownError', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const http = yield* HttpClient.HttpClient

      const response = yield* http.get('/chats')
      const error = yield* api.chats.list().pipe(Effect.flip)

      assert.strictEqual(response.status, 401)
      assert.deepStrictEqual(yield* response.json, { _tag: 'UserUnknownError' })
      assertSchemaEquals(UserUnknownError, error, new UserUnknownError())
    }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    'a created chat reads back with Option and DateTime, and null and ISO on the wire',
    () =>
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient
        const chat = yield* openChat

        const wire = yield* http
          .get(`/chats/${chat.id}`)
          .pipe(Effect.flatMap((response) => response.json))

        assert.deepStrictEqual(chat.title, Option.none())
        assert.isTrue(DateTime.isUtc(chat.createdAt))
        assert.deepInclude(wire, { title: null, createdAt: DateTime.formatIso(chat.createdAt) })
      }).pipe(Effect.provide(ApiTest)),
  )

  it.effect('POST /chats/:chatId/messages is 202 with the queued Run of the user message', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const chat = yield* openChat

      const [sent, response] = yield* api.chats.createMessage({
        params: { chatId: chat.id },
        payload: hello,
        responseMode: 'decoded-and-response',
      })

      assert.strictEqual(response.status, 202)
      assert.deepInclude(sent, { chatId: chat.id, status: 'queued' })
      assert.deepInclude(sent.userMessage, { chatId: chat.id, author: 'user', text: 'Hello' })
      assert.deepStrictEqual(sent.assistantMessage, Option.none())
    }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    'POST /chats/:chatId/messages/:messageId/runs after a failed Run is 202 with a queued Run',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const chat = yield* openChat
        const failed = yield* api.chats.createMessage({
          params: { chatId: chat.id },
          payload: hello,
        })
        yield* refuseRun(failed.id)

        const [retried, response] = yield* api.chats.retryRun({
          params: { chatId: chat.id, messageId: failed.userMessage.id },
          responseMode: 'decoded-and-response',
        })

        assert.strictEqual(response.status, 202)
        assert.strictEqual(retried.status, 'queued')
        assert.deepStrictEqual(retried.userMessage, failed.userMessage)
      }).pipe(Effect.provide(ApiTest)),
  )

  // Live, so the second Run is the newer: under the TestClock both stand at 0, and the order of
  // their ids is random.
  it.live(
    'a retry of a message whose Run is not the newest failed one is 409 RunNotRetryableError',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const chat = yield* openChat
        const first = yield* api.chats.createMessage({
          params: { chatId: chat.id },
          payload: hello,
        })
        yield* refuseRun(first.id)
        const second = yield* api.chats.createMessage({
          params: { chatId: chat.id },
          payload: hello,
        })
        yield* refuseRun(second.id)

        const error = yield* api.chats
          .retryRun({ params: { chatId: chat.id, messageId: first.userMessage.id } })
          .pipe(Effect.flip)

        assertSchemaEquals(
          RunNotRetryableError,
          error,
          new RunNotRetryableError({ userMessageId: first.userMessage.id }),
        )
      }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    'GET /chats/:chatId/messages lists a message with its Run mid-Run, then its failure without the cause',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const http = yield* HttpClient.HttpClient
        const chat = yield* openChat
        const run = yield* api.chats.createMessage({ params: { chatId: chat.id }, payload: hello })

        const reloaded = yield* api.chats
          .listMessages({ params: { chatId: chat.id } })
          .pipe(Effect.head)
        yield* refuseRun(run.id)
        const wire = yield* http
          .get(`/chats/${chat.id}/messages`)
          .pipe(Effect.flatMap((response) => response.json))

        assert.deepInclude(reloaded, { id: run.userMessage.id, author: 'user' })
        assert.deepInclude(Option.getOrThrow(reloaded.run), { id: run.id, status: 'queued' })
        assert.nestedPropertyVal(wire, '[0].run.status', 'failed')
        assert.nestedPropertyVal(wire, '[0].run.failure.reason', 'ReplyRefused')
        assert.notNestedProperty(wire, '[0].run.failure.cause')
      }).pipe(Effect.provide(ApiTest)),
  )

  it.effect('a chat and its message carry a sent attachment on the wire', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const http = yield* HttpClient.HttpClient
      const chat = yield* openChat
      const form = new FormData()
      form.append('files', new File(['png'], 'photo.png', { type: 'image/png' }))
      const uploaded = yield* api.attachments.upload({ payload: form }).pipe(Effect.head)
      const { userMessage } = yield* api.chats.createMessage({
        params: { chatId: chat.id },
        payload: { text: 'Hello', attachmentIds: [uploaded.id] },
      })

      const wires = yield* Effect.forEach(
        [`/chats/${chat.id}`, `/chats/${chat.id}/messages/${userMessage.id}`],
        (url) => http.get(url).pipe(Effect.flatMap((response) => response.json)),
      )

      Arr.forEach(wires, (wire) =>
        assert.deepNestedInclude(wire, {
          'attachments[0].id': uploaded.id,
          'attachments[0].messageId': userMessage.id,
          'attachments[0].chatId': chat.id,
          'attachments[0].fileName': 'photo.png',
          'attachments[0].createdAt': DateTime.formatIso(uploaded.createdAt),
        }),
      )
    }).pipe(Effect.provide(ApiTest)),
  )

  it.effect('two concurrent sends to one chat answer one 202 and one 409 ChatBusyError', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const chat = yield* openChat
      const send = api.chats.createMessage({
        params: { chatId: chat.id },
        payload: hello,
        responseMode: 'response-only',
      })

      const responses = yield* Effect.all([send, send], { concurrency: 'unbounded' })

      const statuses = Arr.map(responses, (response) => response.status)
      const busy = yield* Arr.findFirst(responses, (response) => response.status === 409).pipe(
        Effect.fromOption,
      )
      assert.deepStrictEqual(Arr.sort(statuses, Order.Number), [202, 409])
      assertSchemaEquals(
        ChatBusyError,
        yield* busy.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(ChatBusyError))),
        new ChatBusyError({ id: chat.id }),
      )
    }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    "another user's chat and its messages are 404 ChatNotFoundError, as if it did not exist",
    () =>
      Effect.gen(function* () {
        const chat = yield* Effect.provide(openChat, layerApiClient())
        const [stranger, http] = yield* Effect.zip(ApiClient, HttpClient.HttpClient).pipe(
          Effect.provide(layerApiClient()),
        )
        yield* stranger.users.ensure()

        const responses = yield* Effect.forEach(
          [`/chats/${chat.id}`, `/chats/${chat.id}/messages`],
          (url) => http.get(url),
        )

        yield* Effect.forEach(responses, (response) =>
          Effect.gen(function* () {
            assert.strictEqual(response.status, 404)
            assertSchemaEquals(
              ChatNotFoundError,
              yield* response.json.pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(ChatNotFoundError)),
              ),
              new ChatNotFoundError({ id: chat.id }),
            )
          }),
        )
      }).pipe(Effect.provide(ApiServerTest)),
  )

  it.effect("another chat's message or Run is 404 MessageNotFoundError or RunNotFoundError", () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const chat = yield* openChat
      const other = yield* api.chats.create()
      const run = yield* api.chats.createMessage({ params: { chatId: other.id }, payload: hello })

      const message = yield* api.chats
        .getMessage({ params: { chatId: chat.id, messageId: run.userMessage.id } })
        .pipe(Effect.flip)
      const elsewhere = yield* api.chats
        .getRun({ params: { chatId: chat.id, runId: run.id } })
        .pipe(Effect.flip)

      assertSchemaEquals(
        MessageNotFoundError,
        message,
        new MessageNotFoundError({ id: run.userMessage.id }),
      )
      assertSchemaEquals(RunNotFoundError, elsewhere, new RunNotFoundError({ id: run.id }))
    }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    'a refused Run carries its reason and message on the wire, never its cause or provenance',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const http = yield* HttpClient.HttpClient
        const chat = yield* openChat
        const run = yield* api.chats.createMessage({ params: { chatId: chat.id }, payload: hello })
        yield* refuseRun(run.id)

        const [wire, chatWire] = yield* Effect.forEach(
          [`/chats/${chat.id}/runs/${run.id}`, `/chats/${chat.id}`],
          (url) => http.get(url).pipe(Effect.flatMap((response) => response.json)),
        )

        assert.deepNestedInclude(wire, {
          status: 'failed',
          'failure.reason': 'ReplyRefused',
          assistantMessage: null,
        })
        assert.nestedProperty(wire, 'failure.message')
        assert.notNestedProperty(wire, 'failure.cause')
        assert.notProperty(wire, 'provenance')
        assert.deepInclude(chatWire, { status: 'failed' })
        assert.notProperty(chatWire, 'latestRun')
      }).pipe(Effect.provide(ApiTest)),
  )
})
