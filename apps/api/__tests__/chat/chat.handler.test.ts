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
import type { MessageEntityWhere, RunEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { RequestInvalidError } from '#api/shared/security'
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

/** Reads that answer the value given as their one row. */
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

  it.effect('a payload that fails its schema is 400 RequestInvalidError naming the field', () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient

      const response = yield* http.post(`/chats/${chat.id}/messages`, {
        body: HttpBody.jsonUnsafe({ text: 1 }),
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

  it.effect('POST /chats/:chatId/messages is 202 with the queued Run of the user message', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const [sent, response] = yield* api.chats.createMessage({
        params: { chatId: chat.id },
        payload: hello,
        responseMode: 'decoded-and-response',
      })

      assert.strictEqual(response.status, 202)
      assert.deepInclude(sent, { chatId: chat.id, status: 'queued' })
      assert.deepInclude(sent.userMessage, { chatId: chat.id, author: 'user', text: 'Hello' })
      assert.deepStrictEqual(sent.assistantMessage, Option.none())
    }).pipe(
      Effect.provide(
        asOwner({
          chats: { selectOne: reads.chat(chat) },
          messages: { insert: () => Effect.void },
          runs: { insert: () => Effect.void },
        }),
      ),
    ),
  )

  it.effect('POST /chats/:chatId/runs after a failed Run is 202 with a queued Run', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      const [retried, response] = yield* api.chats.retryRun({
        params: { chatId: chat.id },
        responseMode: 'decoded-and-response',
      })

      assert.strictEqual(response.status, 202)
      assert.strictEqual(retried.status, 'queued')
      assert.deepInclude(retried.userMessage, { id: firstMessage.id, text: firstMessage.text })
    }).pipe(
      Effect.provide(
        asOwner({
          chats: { selectOne: reads.chat(failedChat) },
          messages: { selectOne: reads.message(firstMessage) },
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
      const sent = yield* http.post(`/chats/${chat.id}/messages`, {
        body: HttpBody.jsonUnsafe({ text: 'a\u0000b' }),
      })

      assert.deepStrictEqual([renamed.status, sent.status], [400, 400])
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
      const wheres: Array<MessageEntityWhere | RunEntityWhere> = []
      const findsNone = (where: MessageEntityWhere | RunEntityWhere) =>
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
          new MessageNotFoundError({ id: firstMessage.id, author: Option.none() }),
        )
        assertSchemaEquals(RunNotFoundError, run, new RunNotFoundError({ id: queuedRun.id }))
        assert.deepStrictEqual(wheres, [
          { id: firstMessage.id, chatId: chat.id, userId: owner },
          { id: queuedRun.id, chatId: chat.id, userId: owner },
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

      assert.deepInclude(wire, { status: 'failed', assistantMessage: null })
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
