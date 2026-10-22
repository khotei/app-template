import { assert, describe, it, layer } from '@effect/vitest'
import { Array as Arr, Effect, Option, Record as Rec, Schema, Struct } from 'effect'
import { FetchHttpClient, HttpBody, type HttpClient } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'

import {
  AttachmentBoundError,
  type AttachmentId,
  AttachmentNotFoundError,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import {
  type ApiClient,
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  limits,
  RequestInvalidError,
} from '@app-template/http-api'
import { assertSchemaEquals, isUuidV7 } from '@app-template/testing'

import {
  makeApiHarness,
  openChat,
  type Route,
  spec,
  testSpecDocuments,
  underAuth,
  withApi,
} from '#api/testing/api.harness'

const mebibyte = 1024 * 1024

const file = (name: string, type: string, size = mebibyte) =>
  new File([new Uint8Array(size).fill(7)], name, { type })

const unboundPng = (name: string) => ({
  fileName: FileName.make(name),
  mediaType: MediaType.make('image/png'),
  size: FileSize.make(mebibyte),
  messageId: Option.none(),
})

const formOf = (...files: ReadonlyArray<File>) => {
  const form = new FormData()
  Arr.forEach(files, (entry) => form.append('files', entry))
  return form
}

const png = (name: string) => file(name, 'image/png')

const UploadError = Schema.Union([
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  RequestInvalidError,
])

const storeSize = Effect.flatMap(KeyValueStore.KeyValueStore, (store) => store.size).pipe(
  Effect.orDie,
)

const fieldOnly = () => {
  const form = new FormData()
  form.append('files', 'not a file')
  return form
}

const sixPngs = () => formOf(...Arr.makeBy(limits.attachment.maxFiles + 1, (i) => png(`${i}.png`)))

const tooManyFiles = new RequestInvalidError({
  issues: [{ path: ['files'], message: 'Expected at most 5 files' }],
})

const refusedUploads = [
  {
    name: 'a file of 11 MiB',
    form: () => formOf(png('one.png'), file('big.png', 'image/png', 11 * mebibyte)),
    status: 413,
    error: new AttachmentTooLargeError(),
  },
  {
    name: 'a .zip',
    form: () => formOf(png('one.png'), file('archive.zip', 'application/zip')),
    status: 415,
    error: new AttachmentTypeUnsupportedError(),
  },
  {
    name: 'a .zip declared as image/png',
    form: () => formOf(png('archive.zip')),
    status: 415,
    error: new AttachmentTypeUnsupportedError(),
  },
  {
    name: 'six files',
    form: sixPngs,
    status: 400,
    error: tooManyFiles,
  },
  {
    name: 'a file without a name',
    form: () => formOf(png('one.png'), png('')),
    status: 400,
    error: new RequestInvalidError({
      issues: [{ path: ['files', 1], message: 'Expected a file name' }],
    }),
  },
  {
    name: 'no file',
    form: () => formOf(),
    status: 400,
    error: new RequestInvalidError({
      issues: [{ path: ['files'], message: 'Expected at least 1 file' }],
    }),
  },
  {
    name: 'a field instead of a file',
    form: fieldOnly,
    status: 400,
    error: new RequestInvalidError({
      issues: [{ path: ['files', 0], message: 'Expected a file' }],
    }),
  },
] as const

const uploadOne = (api: ApiClient['Service'], entry: File) =>
  Effect.flatMap(api.attachments.upload({ payload: formOf(entry) }), (uploaded) =>
    Effect.fromOption(Arr.head(uploaded)),
  ).pipe(Effect.orDie)

const requestDownload = (http: HttpClient.HttpClient, id: AttachmentId) =>
  http
    .get(`/attachments/${id}/download`)
    .pipe(
      Effect.provideService(FetchHttpClient.RequestInit, { keepalive: false, redirect: 'manual' }),
    )

const attachmentRoutes: ReadonlyArray<Route> = [
  {
    method: 'post',
    path: '/attachments',
    responses: {
      ...underAuth,
      201: 'Success',
      413: 'AttachmentTooLargeError',
      415: 'AttachmentTypeUnsupportedError',
    },
  },
  {
    method: 'get',
    path: '/attachments/{attachmentId}',
    responses: { ...underAuth, 200: 'Success', 404: 'AttachmentNotFoundError' },
  },
  {
    method: 'get',
    path: '/attachments/{attachmentId}/download',
    responses: { ...underAuth, 302: '<No Content>', 404: 'AttachmentNotFoundError' },
  },
  {
    method: 'delete',
    path: '/attachments/{attachmentId}',
    responses: {
      ...underAuth,
      204: '<No Content>',
      404: 'AttachmentNotFoundError',
      409: 'AttachmentBoundError',
    },
  },
]

describe('attachments', () => {
  layer(makeApiHarness())((it) => {
    it.effect('POST /attachments with two PNGs is 201 with two unbound attachments', () =>
      withApi((api) =>
        Effect.gen(function* () {
          yield* api.users.ensure()

          const [uploaded, response] = yield* api.attachments.upload({
            payload: formOf(png('one.png'), png('two.png')),
            responseMode: 'decoded-and-response',
          })

          assert.strictEqual(response.status, 201)
          assert.deepStrictEqual(
            Arr.map(uploaded, Struct.pick(['fileName', 'mediaType', 'size', 'messageId'])),
            [unboundPng('one.png'), unboundPng('two.png')],
          )
          assert.isTrue(Arr.every(uploaded, ({ id }) => isUuidV7(id)))
        }),
      ),
    )

    it.effect.each(refusedUploads)(
      'POST /attachments with $name is $status and stores nothing',
      ({ form, status, error }) =>
        withApi((api, http) =>
          Effect.gen(function* () {
            yield* api.users.ensure()
            const before = yield* storeSize

            const response = yield* http.post('/attachments', {
              body: HttpBody.formData(form()),
            })

            assert.strictEqual(response.status, status)
            assertSchemaEquals(
              UploadError,
              yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(UploadError)),
              error,
            )
            assert.strictEqual(yield* storeSize, before)
          }),
        ),
    )

    it.effect(
      "GET /attachments/:attachmentId/download is 302 to the memory store's data: URL",
      () =>
        withApi((api, http) =>
          Effect.gen(function* () {
            yield* api.users.ensure()
            // The memory store's URL carries the bytes, so a mebibyte would overflow the header.
            const uploaded = yield* uploadOne(api, file('photo.png', 'image/png', 16))

            const response = yield* requestDownload(http, uploaded.id)

            assert.strictEqual(response.status, 302)
            assert.strictEqual(
              response.headers.location,
              'data:image/png;base64,BwcHBwcHBwcHBwcHBwcHBw==',
            )
          }),
        ),
    )

    it.effect(
      "GET /attachments/:attachmentId/download of another user's is 404 without Location",
      () =>
        Effect.gen(function* () {
          const foreign = yield* withApi((api) =>
            Effect.andThen(api.users.ensure(), uploadOne(api, png('photo.png'))),
          )

          const response = yield* withApi((api, http) =>
            Effect.andThen(api.users.ensure(), requestDownload(http, foreign.id)),
          )

          assert.strictEqual(response.status, 404)
          assert.isUndefined(response.headers.location)
          assertSchemaEquals(
            AttachmentNotFoundError,
            yield* Effect.flatMap(
              response.json,
              Schema.decodeUnknownEffect(AttachmentNotFoundError),
            ),
            new AttachmentNotFoundError({ id: foreign.id }),
          )
        }),
    )

    it.effect('a send with two uploaded ids binds them, and the chat shows their metadata', () =>
      withApi((api) =>
        Effect.gen(function* () {
          const chat = yield* openChat(api)
          const uploaded = yield* api.attachments.upload({
            payload: formOf(png('one.png'), png('two.png')),
          })

          const { userMessage } = yield* api.chats.send({
            params: { chatId: chat.id },
            payload: { text: 'Look', attachmentIds: Arr.map(uploaded, ({ id }) => id) },
          })
          const detail = yield* api.chats.get({ params: { chatId: chat.id } })
          const fetched = yield* Effect.forEach(uploaded, ({ id }) =>
            api.attachments.get({ params: { attachmentId: id } }),
          )

          const bound = Arr.map(uploaded, (attachment) => ({
            ...attachment,
            messageId: Option.some(userMessage.id),
          }))
          assert.deepStrictEqual(userMessage.attachments, bound)
          assert.deepStrictEqual(
            Arr.map(detail.messages, ({ attachments }) => attachments),
            [bound, []],
          )
          assert.deepStrictEqual(fetched, bound)
        }),
      ),
    )

    it.effect('a second send with a bound id is 409 AttachmentBoundError', () =>
      withApi((api) =>
        Effect.gen(function* () {
          const first = yield* openChat(api)
          const second = yield* api.chats.create()
          const photo = yield* uploadOne(api, png('photo.png'))
          const payload = { text: 'Look', attachmentIds: [photo.id] }
          yield* api.chats.send({ params: { chatId: first.id }, payload })

          const error = yield* Effect.flip(
            api.chats.send({ params: { chatId: second.id }, payload }),
          )

          assertSchemaEquals(
            AttachmentBoundError,
            error,
            new AttachmentBoundError({ id: photo.id }),
          )
        }),
      ),
    )

    it.effect('DELETE /attachments/:attachmentId is 204 while unbound, then 404', () =>
      withApi((api) =>
        Effect.gen(function* () {
          yield* api.users.ensure()
          const photo = yield* uploadOne(api, png('photo.png'))
          const params = { attachmentId: photo.id }

          const [, response] = yield* api.attachments.delete({
            params,
            responseMode: 'decoded-and-response',
          })
          const error = yield* Effect.flip(api.attachments.get({ params }))

          assert.strictEqual(response.status, 204)
          assertSchemaEquals(
            AttachmentNotFoundError,
            error,
            new AttachmentNotFoundError({ id: photo.id }),
          )
        }),
      ),
    )

    it.effect('DELETE /attachments/:attachmentId on a bound one is 409 AttachmentBoundError', () =>
      withApi((api, http) =>
        Effect.gen(function* () {
          const chat = yield* openChat(api)
          const photo = yield* uploadOne(api, png('photo.png'))
          yield* api.chats.send({
            params: { chatId: chat.id },
            payload: { text: 'Look', attachmentIds: [photo.id] },
          })

          const response = yield* http.del(`/attachments/${photo.id}`)

          assert.strictEqual(response.status, 409)
          assertSchemaEquals(
            AttachmentBoundError,
            yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(AttachmentBoundError)),
            new AttachmentBoundError({ id: photo.id }),
          )
          assert.isTrue(
            Option.isSome(
              (yield* api.attachments.get({ params: { attachmentId: photo.id } })).messageId,
            ),
          )
        }),
      ),
    )

    it.effect("another user's attachment is 404 AttachmentNotFoundError on every route", () =>
      Effect.gen(function* () {
        const foreign = yield* withApi((api) =>
          Effect.andThen(api.users.ensure(), uploadOne(api, png('photo.png'))),
        )
        const params = { attachmentId: foreign.id }
        const notFound = new AttachmentNotFoundError({ id: foreign.id })

        const errors = yield* withApi((api) =>
          Effect.gen(function* () {
            const chat = yield* openChat(api)
            return yield* Effect.all(
              Arr.map(
                [
                  api.chats.send({
                    params: { chatId: chat.id },
                    payload: { text: 'Look', attachmentIds: [foreign.id] },
                  }),
                  api.attachments.get({ params }),
                  api.attachments.download({ params }),
                  api.attachments.delete({ params }),
                ],
                Effect.flip,
              ),
            )
          }),
        )

        assertSchemaEquals(Schema.Array(AttachmentNotFoundError), errors, [
          notFound,
          notFound,
          notFound,
          notFound,
        ])
      }),
    )

    it.effect('six files through ApiClient fail with RequestInvalidError', () =>
      withApi((api) =>
        Effect.gen(function* () {
          yield* api.users.ensure()

          const error = yield* Effect.flip(api.attachments.upload({ payload: sixPngs() }))

          assertSchemaEquals(RequestInvalidError, error, tooManyFiles)
        }),
      ),
    )
  })

  testSpecDocuments(attachmentRoutes)

  it.effect('the spec documents a multipart upload and a download without a body', () =>
    Effect.sync(() => {
      assert.deepStrictEqual(
        Rec.keys(spec.paths['/attachments']?.post?.requestBody?.content ?? {}),
        ['multipart/form-data'],
      )
      assert.deepStrictEqual(
        Rec.keys(
          spec.paths['/attachments/{attachmentId}/download']?.get?.responses['302']?.content ?? {},
        ),
        [],
      )
    }),
  )
})
