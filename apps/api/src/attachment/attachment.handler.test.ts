import { assert, describe, it, layer } from '@effect/vitest'
import { Array as Arr, Effect, Option, Order, Record as Rec, Schema, Struct } from 'effect'
import { FetchHttpClient, HttpBody, type HttpClient } from 'effect/http'

import {
  AttachmentBoundError,
  type AttachmentId,
  AttachmentNotFoundError,
  AttachmentStore,
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
import { AwsClientsMiniStack, assertSchemaEquals } from '@app-template/testing'

import {
  countStoredObjects,
  openChat,
  type Route,
  spec,
  testSpecDocuments,
  underAuth,
  withApi,
  withOwnApi,
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

/**
 * Sorts by id, to compare as a set what shares a `createdAt` (a send's two messages, one
 * request's uploads): the store leaves their relative order open.
 */
const sortById = <A extends { readonly id: string }>(items: ReadonlyArray<A>) =>
  Arr.sortWith(items, (item) => item.id, Order.String)

const UploadError = Schema.Union([
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  RequestInvalidError,
])

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
  layer(AwsClientsMiniStack, { timeout: '60 seconds' })((it) => {
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
        }),
      ).pipe(withOwnApi),
    )

    it.effect.each(refusedUploads)(
      'POST /attachments with $name is $status and stores nothing',
      ({ form, status, error }) =>
        withApi((api, http) =>
          Effect.gen(function* () {
            yield* api.users.ensure()

            const response = yield* http.post('/attachments', {
              body: HttpBody.formData(form()),
            })

            assert.strictEqual(response.status, status)
            assertSchemaEquals(
              UploadError,
              yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(UploadError)),
              error,
            )
            assert.strictEqual(yield* countStoredObjects, 0)
          }),
        ).pipe(withOwnApi),
    )

    it.effect("GET /attachments/:attachmentId/download is 302 to the store's URL", () =>
      withApi((api, http) =>
        Effect.gen(function* () {
          yield* api.users.ensure()
          const uploaded = yield* uploadOne(api, png('photo.png'))

          const response = yield* requestDownload(http, uploaded.id)
          const url = yield* Effect.flatMap(AttachmentStore, (store) => store.url(uploaded.id))

          assert.strictEqual(response.status, 302)
          assert.deepStrictEqual(Option.some(response.headers.location), Option.map(url, String))
        }),
      ).pipe(withOwnApi),
    )

    it.effect('a send with two uploaded ids binds them, and the chat shows their metadata', () =>
      withApi((api) =>
        Effect.gen(function* () {
          const chat = yield* openChat(api)
          const uploaded = yield* api.attachments.upload({
            payload: formOf(png('one.png'), png('two.png')),
          })

          const { userMessage, assistantMessage } = yield* api.chats.send({
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
            Rec.fromEntries(
              Arr.map(detail.messages, ({ id, attachments }) => [id, sortById(attachments)]),
            ),
            { [userMessage.id]: sortById(bound), [assistantMessage.id]: [] },
          )
          assert.deepStrictEqual(fetched, bound)
        }),
      ).pipe(withOwnApi),
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
      ).pipe(withOwnApi),
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
      ).pipe(withOwnApi),
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
      }).pipe(withOwnApi),
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
