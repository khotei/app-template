import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema, Stream } from 'effect'
import { FetchHttpClient, HttpBody, HttpClient } from 'effect/http'

import {
  Attachment,
  AttachmentId,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/application/chat'
import { owner } from '@app-template/application/chat/testing'
import { FileRepository } from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { assertSchemaEquals, epoch, png as pngBytes } from '@app-template/packages/testing'

import {
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  maxFiles,
} from '#api/attachment/attachment.http'
import { RequestInvalidError } from '#api/shared/security'
import { layerApiTest, ownerCookie, signedIn } from '#testing/api.test-layer'

const mebibyte = 1024 * 1024

const file = (name: string, type: string, size = mebibyte) =>
  new File([new Uint8Array(size).fill(7)], name, { type })

function formOf(...files: ReadonlyArray<File>) {
  const form = new FormData()
  Arr.forEach(files, (entry) => form.append('files', entry))
  return form
}

const png = (name: string) => file(name, 'image/png')

/** `owner` signed in, over a store that takes the rows of an upload and removes them again. */
const UploadTest = layerApiTest(
  { users: signedIn, attachments: { insert: () => Effect.void, delete: () => Effect.void } },
  ownerCookie,
)

/** An unbound attachment of `owner` in the library. */
const photo = buildAttachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
  userId: owner,
  fileName: FileName.make('photo.png'),
  mediaType: MediaType.make('image/png'),
  size: FileSize.make(pngBytes.length),
  createdAt: epoch,
})

const photoRow = encodeRowWith(Attachment)(photo)

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
    form: () => formOf(...Arr.makeBy(maxFiles + 1, (i) => png(`${i}.png`))),
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
        const http = yield* HttpClient.HttpClient

        const response = yield* http.post('/attachments', { body: HttpBody.formData(form()) })

        assert.strictEqual(response.status, status)
        assertSchemaEquals(
          UploadError,
          yield* response.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(UploadError))),
          error,
        )
      }).pipe(Effect.provide(UploadTest)),
  )

  it.effect('POST /attachments with a file name decoding to U+0000 is 400', () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const body = [
        '--b',
        `Content-Disposition: form-data; name="files"; filename*=UTF-8''a%00b.png`,
        'Content-Type: image/png',
        '',
        'png',
        '--b--',
        '',
      ].join('\r\n')

      const response = yield* http.post('/attachments', {
        body: HttpBody.text(body, 'multipart/form-data; boundary=b'),
      })

      assert.strictEqual(response.status, 400)
      assertSchemaEquals(
        UploadError,
        yield* response.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(UploadError))),
        new RequestInvalidError({
          issues: [{ path: ['files', 0], message: 'Expected a file name' }],
        }),
      )
    }).pipe(Effect.provide(UploadTest)),
  )

  it.effect("GET /attachments answers the user's library on the wire", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient

      const wire = yield* http.get('/attachments').pipe(Effect.flatMap((response) => response.json))

      assert.deepStrictEqual(wire, [
        {
          id: photo.id,
          userId: owner,
          messageId: null,
          chatId: null,
          sourceId: null,
          fileName: 'photo.png',
          mediaType: 'image/png',
          size: pngBytes.length,
          createdAt: DateTime.formatIso(epoch),
        },
      ])
    }).pipe(
      Effect.provide(
        layerApiTest(
          {
            users: signedIn,
            attachments: { selectMany: () => photoRow.pipe(Effect.map(Arr.of)) },
          },
          ownerCookie,
        ),
      ),
    ),
  )

  it.effect("GET /attachments/:attachmentId/download is 302 to the bucket's URL", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      yield* FileRepository.use((files) =>
        files.insert({ ...photo, content: Stream.make(pngBytes) }),
      )

      const response = yield* http.get(`/attachments/${photo.id}/download`).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {
          keepalive: false,
          redirect: 'manual',
        }),
      )

      const bucketHref = yield* FileRepository.use((files) =>
        files.selectOne({ id: photo.id }),
      ).pipe(Effect.map(Option.map((stored) => stored.url.href)))
      assert.strictEqual(response.status, 302)
      assert.deepStrictEqual(Option.some(response.headers.location), bucketHref)
    }).pipe(
      Effect.provide(
        layerApiTest(
          {
            users: signedIn,
            attachments: { selectOne: () => photoRow.pipe(Effect.map(Option.some)) },
          },
          ownerCookie,
        ),
      ),
    ),
  )
})
