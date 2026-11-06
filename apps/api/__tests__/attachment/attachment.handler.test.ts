import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema } from 'effect'
import { FetchHttpClient, HttpBody, HttpClient } from 'effect/http'

import {
  ApiClient,
  AttachmentId,
  AttachmentNotFoundError,
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  limits,
  RequestInvalidError,
} from '@app-template/http-api'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { ApiTest } from '#testing/api.test-layer'

const mebibyte = 1024 * 1024

const file = (name: string, type: string, size = mebibyte) =>
  new File([new Uint8Array(size).fill(7)], name, { type })

function formOf(...files: ReadonlyArray<File>) {
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
    form: () => formOf(...Arr.makeBy(limits.attachment.maxFiles + 1, (i) => png(`${i}.png`))),
    status: 400,
    error: new RequestInvalidError({
      issues: [{ path: ['files'], message: 'Expected at most 5 files' }],
    }),
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
    form: () => {
      const form = new FormData()
      form.append('files', 'not a file')
      return form
    },
    status: 400,
    error: new RequestInvalidError({
      issues: [{ path: ['files', 0], message: 'Expected a file' }],
    }),
  },
] as const

describe('attachments', () => {
  it.effect.each(refusedUploads)(
    'POST /attachments with $name is $status',
    ({ form, status, error }) =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const http = yield* HttpClient.HttpClient
        yield* api.users.ensure()

        const response = yield* http.post('/attachments', { body: HttpBody.formData(form()) })

        assert.strictEqual(response.status, status)
        assertSchemaEquals(
          UploadError,
          yield* response.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(UploadError))),
          error,
        )
      }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    'an uploaded attachment reads back with Option and DateTime, and null and ISO on the wire',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        const http = yield* HttpClient.HttpClient
        yield* api.users.ensure()
        const uploaded = yield* api.attachments
          .upload({ payload: formOf(png('photo.png')) })
          .pipe(Effect.head)

        const read = yield* api.attachments.get({ params: { attachmentId: uploaded.id } })
        const wire = yield* http
          .get(`/attachments/${uploaded.id}`)
          .pipe(Effect.flatMap((response) => response.json))

        assert.deepStrictEqual(read.messageId, Option.none())
        assert.isTrue(DateTime.isUtc(read.createdAt))
        assert.deepInclude(wire, {
          messageId: null,
          chatId: null,
          createdAt: DateTime.formatIso(read.createdAt),
        })
      }).pipe(Effect.provide(ApiTest)),
  )

  it.effect(
    'GET /attachments/:attachmentId of an unknown id is caught as AttachmentNotFoundError',
    () =>
      Effect.gen(function* () {
        const api = yield* ApiClient
        yield* api.users.ensure()
        const unknown = AttachmentId.make('0192d4e0-7b3a-7c00-8000-00000000dead')

        const caught = yield* api.attachments
          .get({ params: { attachmentId: unknown } })
          .pipe(Effect.catchTag('AttachmentNotFoundError', Effect.succeed))

        assertSchemaEquals(
          AttachmentNotFoundError,
          caught,
          new AttachmentNotFoundError({ ids: [unknown] }),
        )
      }).pipe(Effect.provide(ApiTest)),
  )

  it.effect("GET /attachments/:attachmentId/download is 302 to the bucket's URL", () =>
    Effect.gen(function* () {
      const api = yield* ApiClient
      const http = yield* HttpClient.HttpClient
      yield* api.users.ensure()
      const uploaded = yield* api.attachments
        .upload({ payload: formOf(png('photo.png')) })
        .pipe(Effect.head)

      const response = yield* http.get(`/attachments/${uploaded.id}/download`).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {
          keepalive: false,
          redirect: 'manual',
        }),
      )

      assert.strictEqual(response.status, 302)
      assert.strictEqual(response.headers.location, `memory:attachments/${uploaded.id}`)
    }).pipe(Effect.provide(ApiTest)),
  )
})
