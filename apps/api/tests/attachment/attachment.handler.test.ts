import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Schema } from 'effect'
import { FetchHttpClient, HttpBody, HttpClient } from 'effect/http'

import {
  ApiClient,
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  limits,
  RequestInvalidError,
} from '@app-template/http-api'
import { assertSchemaEquals } from '@app-template/testing'

import { ApiTest } from '#api/testing/api.test-layer'

const mebibyte = 1024 * 1024

const file = (name: string, type: string, size = mebibyte) =>
  new File([new Uint8Array(size).fill(7)], name, { type })

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
          yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(UploadError)),
          error,
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
