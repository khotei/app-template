import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema } from 'effect'
import { HttpBody, HttpClient } from 'effect/http'

import {
  Attachment,
  AttachmentId,
  buildAttachment,
  Chat,
  ChatNotFoundError,
  FileName,
  FileSize,
  MediaType,
  Message,
  MessageNotFoundError,
  Run,
  RunNotFoundError,
} from '@app-template/application/chat'
import { chat, firstMessage, owner, queuedRun } from '@app-template/application/chat/testing'
import { UserUnknownError } from '@app-template/application/identity'
import { encodeRowWith } from '@app-template/packages/db'
import { assertSchemaEquals, epoch, png } from '@app-template/packages/testing'

import { RequestInvalidError } from '#api/shared/security'
import {
  type ApiRepositoryMocks,
  layerApiTest,
  ownerCookie,
  signedIn,
} from '#testing/api.test-layer'
import { ApiClient } from '#testing/api-client.test-layer'

/** An api where `owner` is signed in, over the stores `mocks` give. */
const asOwner = (mocks: ApiRepositoryMocks = {}) =>
  layerApiTest({ users: signedIn, ...mocks }, ownerCookie)

/** Reads that answer the value given as their one row. */
const reads = {
  chat: (value: Chat) => () => encodeRowWith(Chat)(value).pipe(Effect.map(Option.some)),
  message: (value: Message) => () => encodeRowWith(Message)(value).pipe(Effect.map(Option.some)),
  run: (value: Run) => () => encodeRowWith(Run)(value).pipe(Effect.map(Option.some)),
}

const hello = { text: 'Hello', attachmentIds: [] }

const refusedRun = new Run({
  ...queuedRun,
  status: 'failed',
  failure: Option.some({
    reason: 'ReplyRefused',
    message: 'The assistant declined to answer this message.',
  }),
})

const failedChat = new Chat({ ...chat, run: Option.some(refusedRun) })

const record = new Attachment({
  ...buildAttachment({
    id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000025'),
    userId: owner,
    fileName: FileName.make('photo.png'),
    mediaType: MediaType.make('image/png'),
    size: FileSize.make(png.length),
    createdAt: epoch,
  }),
  messageId: Option.some(firstMessage.id),
  chatId: Option.some(chat.id),
  sourceId: Option.some(AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024')),
})

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

  it.effect('a payload that fails its schema is 400 RequestInvalidError naming each field', () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient

      const response = yield* http.post(`/chats/${chat.id}/messages`, {
        body: HttpBody.jsonUnsafe({ text: 1, attachmentIds: ['not-an-id'] }),
      })
      const error = yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(RequestInvalidError)),
      )

      assert.strictEqual(response.status, 400)
      assert.deepStrictEqual(
        Arr.map(error.issues, ({ path }) => path),
        [['text'], ['attachmentIds', 0]],
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

  it.effect(
    'POST /chats/:chatId/messages/:messageId/runs after a failed Run is 202 with a queued Run',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient

        const [retried, response] = yield* api.chats.retryRun({
          params: { chatId: chat.id, userMessageId: firstMessage.id },
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
      assert.nestedPropertyVal(wire, '[0].run.failure.reason', 'ReplyRefused')
    }).pipe(
      Effect.provide(
        asOwner({
          chats: { selectOne: reads.chat(chat) },
          messages: {
            selectMany: () =>
              encodeRowWith(Message)(
                new Message({ ...firstMessage, run: Option.some(refusedRun) }),
              ).pipe(Effect.map(Arr.of)),
          },
        }),
      ),
    ),
  )

  it.effect('a chat and its message carry a sent attachment on the wire', () =>
    Effect.gen(function* () {
      const wires = yield* Effect.forEach(
        [`/chats/${chat.id}`, `/chats/${chat.id}/messages/${firstMessage.id}`],
        getJson,
      )

      Arr.forEach(wires, (wire) =>
        assert.deepNestedInclude(wire, {
          'attachments[0].sourceId': '0192d4e0-7b3a-7c00-8000-000000000024',
          'attachments[0].messageId': firstMessage.id,
          'attachments[0].chatId': chat.id,
          'attachments[0].fileName': 'photo.png',
          'attachments[0].createdAt': DateTime.formatIso(epoch),
        }),
      )
    }).pipe(
      Effect.provide(
        asOwner({
          chats: { selectOne: reads.chat(new Chat({ ...chat, attachments: [record] })) },
          messages: {
            selectOne: reads.message(new Message({ ...firstMessage, attachments: [record] })),
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
        body: HttpBody.jsonUnsafe({ text: 'a\u0000b', attachmentIds: [] }),
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
    'a message or Run the store finds none of is 404 MessageNotFoundError or RunNotFoundError',
    () =>
      Effect.gen(function* () {
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
      }).pipe(
        Effect.provide(
          asOwner({
            messages: { selectOne: () => Effect.succeedNone },
            runs: { selectOne: () => Effect.succeedNone },
          }),
        ),
      ),
  )

  it.effect('a refused Run carries its reason and message on the wire', () =>
    Effect.gen(function* () {
      const [wire, chatWire] = yield* Effect.forEach(
        [`/chats/${chat.id}/runs/${refusedRun.id}`, `/chats/${chat.id}`],
        getJson,
      )

      assert.deepNestedInclude(wire, {
        status: 'failed',
        'failure.reason': 'ReplyRefused',
        assistantMessage: null,
      })
      assert.nestedProperty(wire, 'failure.message')
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
