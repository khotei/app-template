import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema } from 'effect'
import { HttpBody, type HttpClientError, type HttpClientResponse } from 'effect/http'
import { TestClock } from 'effect/testing'

import { AttachmentId } from '@app-template/domain/attachment'
import {
  ChatNotFoundError,
  ChatTitle,
  failMessage,
  type MessageId,
  MessageInputInvalidError,
  MessageNotFoundError,
  MessageRepository,
} from '@app-template/domain/chat'
import { UserUnknownError } from '@app-template/domain/user'
import { limits, RequestInvalidError } from '@app-template/http-api'
import { MessageRepositoryPg } from '@app-template/infrastructure/chat'
import { assertSchemaEquals, describeOnMiniStack } from '@app-template/testing'

import {
  openChat,
  type Route,
  spec,
  testSpecDocuments,
  underAuth,
  withApi,
} from '#api/testing/api.harness'

const hello = { text: 'Hello', attachmentIds: [] }

const unknownAttachmentId = AttachmentId.make('01920000-0000-7000-8000-000000000001')

/** Picks the fields `schema` names from a raw JSON body, to assert the wire form itself. */
const readWire = <S extends Schema.Decoder<unknown>>(
  request: Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>,
  schema: S,
) =>
  Effect.flatMap(request, (response) => response.json).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
  )

const WireSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  activeMessage: Schema.NullOr(Schema.Struct({ id: Schema.String, stage: Schema.String })),
})

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

const chatRoutes: ReadonlyArray<Route> = [
  { method: 'post', path: '/chats', responses: { ...underAuth, 201: 'Success' } },
  { method: 'get', path: '/chats', responses: { ...underAuth, 200: 'Success' } },
  {
    method: 'get',
    path: '/chats/{chatId}',
    responses: { ...underAuth, 200: 'Success', 404: 'ChatNotFoundError' },
  },
  {
    method: 'patch',
    path: '/chats/{chatId}',
    responses: { ...underAuth, 200: 'Success', 404: 'ChatNotFoundError' },
  },
  {
    method: 'delete',
    path: '/chats/{chatId}',
    responses: { ...underAuth, 204: '<No Content>', 404: 'ChatNotFoundError' },
  },
  {
    method: 'post',
    path: '/chats/{chatId}/messages',
    responses: {
      ...underAuth,
      202: 'Success',
      400: 'MessageInputInvalidError | RequestInvalidError',
      404: 'ChatNotFoundError | AttachmentNotFoundError',
      409: 'ChatBusyError | AttachmentBoundError',
    },
  },
  {
    method: 'get',
    path: '/chats/{chatId}/messages/{messageId}',
    responses: {
      ...underAuth,
      200: 'Success',
      404: 'ChatNotFoundError | MessageNotFoundError',
    },
  },
]

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

  it.effect('POST /chats is 201 with an untitled chat and no owner on the wire', () =>
    withApi((api) =>
      Effect.gen(function* () {
        yield* api.users.ensure()
        const [chat, response] = yield* api.chats.create({
          responseMode: 'decoded-and-response',
        })

        assert.strictEqual(response.status, 201)
        assert.deepStrictEqual(yield* response.json, {
          id: chat.id,
          title: null,
          createdAt: DateTime.formatIso(chat.createdAt),
          updatedAt: DateTime.formatIso(chat.createdAt),
        })
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

  it.effect('GET /chats lists the last sent chat first with its queued reply as active', () =>
    withApi((api, { http }) =>
      Effect.gen(function* () {
        const first = yield* openChat(api)
        const second = yield* api.chats.create()
        yield* TestClock.adjust('1 second')
        const { assistantMessage } = yield* api.chats.send({
          params: { chatId: first.id },
          payload: hello,
        })

        const listed = yield* readWire(http.get('/chats'), Schema.Array(WireSummary))

        assert.deepStrictEqual(listed, [
          {
            id: first.id,
            title: null,
            activeMessage: { id: assistantMessage.id, stage: 'queued' },
          },
          { id: second.id, title: null, activeMessage: null },
        ])
      }),
    ),
  )

  it.effect("another user's chat and message are 404, as if they did not exist", () =>
    withApi((api, { browse }) =>
      Effect.gen(function* () {
        const chat = yield* openChat(api)
        const sent = yield* api.chats.send({ params: { chatId: chat.id }, payload: hello })
        const owned = { chatId: chat.id, messageId: sent.userMessage.id }

        yield* browse((stranger, { http }) =>
          Effect.gen(function* () {
            const own = yield* openChat(stranger)

            const response = yield* http.get(`/chats/${owned.chatId}`)
            const chatError = yield* Effect.flip(stranger.chats.getMessage({ params: owned }))
            const messageError = yield* Effect.flip(
              stranger.chats.getMessage({
                params: { chatId: own.id, messageId: owned.messageId },
              }),
            )

            assert.strictEqual(response.status, 404)
            assertSchemaEquals(
              ChatNotFoundError,
              chatError,
              new ChatNotFoundError({ id: owned.chatId }),
            )
            assertSchemaEquals(
              MessageNotFoundError,
              messageError,
              new MessageNotFoundError({ id: owned.messageId }),
            )
          }),
        )
      }),
    ),
  )

  it.effect('PATCH /chats/:chatId stores the title trimmed', () =>
    withApi((api, { http }) =>
      Effect.gen(function* () {
        const chat = yield* openChat(api)

        const renamed = yield* readWire(
          http.patch(`/chats/${chat.id}`, { body: HttpBody.jsonUnsafe({ title: ' Trip ' }) }),
          Schema.Struct({ title: Schema.NullOr(Schema.String) }),
        )
        const detail = yield* api.chats.get({ params: { chatId: chat.id } })

        assert.deepStrictEqual(renamed, { title: 'Trip' })
        assert.deepStrictEqual(detail.title, Option.some(ChatTitle.make('Trip')))
      }),
    ),
  )

  it.effect.each([
    {
      name: 'a blank title',
      title: '  ',
      message: 'Expected a value with a length of at least 1',
    },
    {
      name: 'a title of 121 characters',
      title: 'a'.repeat(limits.chat.maxTitleLength + 1),
      message: 'Expected a value with a length of at most 120',
    },
  ])('PATCH with $name is 400 RequestInvalidError at title', ({ title, message }) =>
    withApi((api, { http }) =>
      Effect.gen(function* () {
        const chat = yield* openChat(api)

        const response = yield* http.patch(`/chats/${chat.id}`, {
          body: HttpBody.jsonUnsafe({ title }),
        })

        assert.strictEqual(response.status, 400)
        assertSchemaEquals(
          RequestInvalidError,
          yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(RequestInvalidError)),
          new RequestInvalidError({ issues: [{ path: ['title'], message }] }),
        )
      }),
    ),
  )

  it.effect('DELETE /chats/:chatId is 204 while a reply is active, and the chat is gone', () =>
    withApi((api) =>
      Effect.gen(function* () {
        const chat = yield* openChat(api)
        yield* api.chats.send({ params: { chatId: chat.id }, payload: hello })

        const [, response] = yield* api.chats.delete({
          params: { chatId: chat.id },
          responseMode: 'decoded-and-response',
        })
        const error = yield* Effect.flip(api.chats.get({ params: { chatId: chat.id } }))

        assert.strictEqual(response.status, 204)
        assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
      }),
    ),
  )

  it.effect.each([
    {
      name: 'a third attachment id that is no UUID',
      payload: { text: 'Hello', attachmentIds: [unknownAttachmentId, unknownAttachmentId, 'x'] },
      paths: [['attachmentIds', 2]],
    },
    {
      name: 'an overlong text and an id that is no UUID',
      payload: { text: 'a'.repeat(limits.message.maxTextLength + 1), attachmentIds: ['x'] },
      paths: [['text'], ['attachmentIds', 0]],
    },
  ])('a send with $name lists every issue with its path', ({ payload, paths }) =>
    withApi((api, { http }) =>
      Effect.gen(function* () {
        const chat = yield* openChat(api)

        const { issues } = yield* readWire(
          http.post(`/chats/${chat.id}/messages`, { body: HttpBody.jsonUnsafe(payload) }),
          RequestInvalidError,
        )

        assert.deepStrictEqual(
          Arr.map(issues, ({ path }) => path),
          paths,
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

  it.effect('a send with a blank text fails ApiClient with MessageInputInvalidError', () =>
    withApi((api) =>
      Effect.gen(function* () {
        const chat = yield* openChat(api)

        const error = yield* Effect.flip(
          api.chats.send({
            params: { chatId: chat.id },
            payload: { text: '  ', attachmentIds: [] },
          }),
        )

        assertSchemaEquals(MessageInputInvalidError, error, new MessageInputInvalidError())
      }),
    ),
  )
})

describe('chats spec', () => {
  it.effect("the spec narrows a summary's active stage to the running ones", () =>
    Effect.sync(() =>
      assert.deepNestedInclude(
        spec.paths['/chats']?.get?.responses['200']?.content?.['application/json']?.schema,
        {
          'items.properties.activeMessage.anyOf[0].properties.stage': {
            type: 'string',
            enum: ['queued', 'preparing', 'generating'],
          },
        },
      ),
    ),
  )

  testSpecDocuments(chatRoutes)
})
