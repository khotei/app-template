import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Option, Schema } from 'effect'
import { HttpBody, HttpClient } from 'effect/http'

import {
  Chat,
  ChatNotFoundError,
  Message,
  MessageNotFoundError,
  Run,
  RunNotFoundError,
} from '@app-template/application/chat'
import { chat, firstMessage, owner, queuedRun } from '@app-template/application/chat/testing'
import { UserUnknownError } from '@app-template/application/identity'
import type {
  MessageColumns,
  MessageEntityWhere,
  RunEntitySelectWhere,
} from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { RequestInvalidError } from '#api/shared/api-security'
import {
  ApiClient,
  type ApiRepositoryMocks,
  layerApiTest,
  ownerCookie,
  signedIn,
} from '#testing/api.test-layer'

/** An api where `owner` is signed in, over the stores `mocks` give. */
const asOwner = (mocks: ApiRepositoryMocks = {}) =>
  layerApiTest({ users: signedIn, ...mocks }, ownerCookie)

/** Reads that return the value given as their one row. */
const reads = {
  chat: (value: Chat) => () => encodeWith(Chat)(value).pipe(Effect.map(Option.some)),
  message: (value: Message) => () => encodeWith(Message)(value).pipe(Effect.map(Option.some)),
  run: (value: Run) => () => encodeWith(Run)(value).pipe(Effect.map(Option.some)),
}

const hello = { text: 'Hello' }

const refusedRun = new Run({
  ...queuedRun,
  status: 'failed',
  failure: Option.some({ cause: 'stop_reason refusal' }),
})

const failedChat = new Chat({ ...chat, run: Option.some(refusedRun) })

const getJson = (url: string) =>
  HttpClient.HttpClient.use((http) => http.get(url)).pipe(
    Effect.flatMap((response) => response.json),
  )

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
    }).pipe(Effect.provide(layerApiTest({ users: { selectOne: () => Effect.succeedNone } }))),
  )

  it.effect.each([
    { name: 'a text not a string', text: 1 },
    { name: 'a blank text', text: '  ' },
  ])('a payload with $name is 400 RequestInvalidError naming the field', ({ text }) =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient

      const response = yield* http.post(`/chats/${chat.id}/messages`, {
        body: HttpBody.jsonUnsafe({ text }),
      })
      const error = yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(RequestInvalidError)),
      )

      assert.strictEqual(response.status, 400)
      assert.deepStrictEqual(
        Arr.map(error.issues, ({ path }) => path),
        [['text']],
      )
    }).pipe(Effect.provide(asOwner())),
  )

  it.effect('POST /chats/:chatId/messages is 202 with the queued Run of the user message', () => {
    const asked: Array<MessageColumns> = []
    return Effect.gen(function* () {
      const api = yield* ApiClient

      const [queued, response] = yield* api.chats.ask({
        params: { chatId: chat.id },
        payload: hello,
        responseMode: 'decoded-and-response',
      })

      assert.strictEqual(response.status, 202)
      assert.deepInclude(queued, {
        chatId: chat.id,
        status: 'queued',
        assistantMessageId: Option.none(),
      })
      assert.deepStrictEqual(
        Arr.map(asked, ({ id, author, text }) => ({ id, author, text })),
        [{ id: queued.userMessageId, author: 'user', text: 'Hello' }],
      )
    }).pipe(
      Effect.provide(
        asOwner({
          chats: { selectOne: reads.chat(chat) },
          messages: {
            insert: (message) =>
              Effect.sync(() => {
                asked.push(message)
              }),
          },
          runs: { insert: () => Effect.void },
        }),
      ),
    )
  })

  it.effect('POST /chats/:chatId/runs after a failed Run is 202 with a queued Run', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const [retried, response] = yield* api.chats.retryRun({
        params: { chatId: chat.id },
        responseMode: 'decoded-and-response',
      })

      assert.strictEqual(response.status, 202)
      assert.deepInclude(retried, { status: 'queued', userMessageId: firstMessage.id })
    }).pipe(
      Effect.provide(
        asOwner({
          chats: { selectOne: reads.chat(failedChat) },
          runs: { insert: () => Effect.void },
        }),
      ),
    ),
  )

  it.effect('GET /chats/:chatId/messages lists a message with its failed Run', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const listed = yield* api.chats
        .listMessages({ params: { chatId: chat.id } })
        .pipe(Effect.head)
      const wire = yield* getJson(`/chats/${chat.id}/messages`)

      assert.deepInclude(listed, { id: firstMessage.id, author: 'user' })
      assert.deepInclude(Option.getOrThrow(listed.run), { id: refusedRun.id, status: 'failed' })
      assert.notNestedProperty(wire, '[0].run.failure')
    }).pipe(
      Effect.provide(
        asOwner({
          chats: { selectOne: reads.chat(chat) },
          messages: {
            selectMany: () =>
              encodeWith(Message)(
                new Message({ ...firstMessage, run: Option.some(refusedRun) }),
              ).pipe(Effect.map(Arr.of)),
          },
        }),
      ),
    ),
  )

  it.effect('a title or a text holding U+0000 is 400 before the store is asked', () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient

      const renamed = yield* http.patch(`/chats/${chat.id}`, {
        body: HttpBody.jsonUnsafe({ title: 'a\u0000b' }),
      })
      const asked = yield* http.post(`/chats/${chat.id}/messages`, {
        body: HttpBody.jsonUnsafe({ text: 'a\u0000b' }),
      })

      assert.deepStrictEqual([renamed.status, asked.status], [400, 400])
    }).pipe(Effect.provide(asOwner())),
  )

  it.effect(
    'a chat the store finds none of for the user is 404 ChatNotFoundError, with its messages',
    () =>
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient

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
      }).pipe(Effect.provide(asOwner({ chats: { selectOne: () => Effect.succeedNone } }))),
  )

  it.effect(
    'a message or Run the store finds none of for the user is 404 MessageNotFoundError or RunNotFoundError',
    () => {
      const wheres: Array<MessageEntityWhere | RunEntitySelectWhere> = []
      const findsNone = (where: MessageEntityWhere | RunEntitySelectWhere) =>
        Effect.sync(() => {
          wheres.push(where)
        }).pipe(Effect.as(Option.none()))
      return Effect.gen(function* () {
        const api = yield* ApiClient

        const message = yield* api.chats
          .getMessage({ params: { chatId: chat.id, messageId: firstMessage.id } })
          .pipe(Effect.flip)
        const run = yield* api.chats
          .getRun({ params: { chatId: chat.id, runId: queuedRun.id } })
          .pipe(Effect.flip)

        assertSchemaEquals(
          MessageNotFoundError,
          message,
          new MessageNotFoundError({ id: firstMessage.id }),
        )
        assertSchemaEquals(
          RunNotFoundError,
          run,
          new RunNotFoundError({ where: { id: queuedRun.id } }),
        )
        assert.deepStrictEqual(wheres, [
          { id: firstMessage.id, chatId: chat.id, chat: { userId: owner } },
          { id: queuedRun.id, chatId: chat.id, chat: { userId: owner } },
        ])
      }).pipe(
        Effect.provide(
          asOwner({ messages: { selectOne: findsNone }, runs: { selectOne: findsNone } }),
        ),
      )
    },
  )

  it.effect('a failed Run reaches the wire by its status alone, never its failure', () =>
    Effect.gen(function* () {
      const [wire, chatWire] = yield* Effect.forEach(
        [`/chats/${chat.id}/runs/${refusedRun.id}`, `/chats/${chat.id}`],
        getJson,
      )

      assert.deepInclude(wire, { status: 'failed', assistantMessageId: null })
      assert.notProperty(wire, 'failure')
      assert.deepInclude(chatWire, { status: 'failed' })
      assert.notProperty(chatWire, 'run')
    }).pipe(
      Effect.provide(
        asOwner({
          chats: { selectOne: reads.chat(failedChat) },
          runs: { selectOne: reads.run(refusedRun) },
        }),
      ),
    ),
  )
})
