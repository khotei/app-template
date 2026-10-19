import { Array as Arr, Effect, Option, Schema, Stream, Struct } from 'effect'
import { HttpServerResponse, Mime, Multipart } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'

import { AttachmentService } from '@app-template/application/attachment'
import {
  type Attachment as AttachmentModel,
  FileName,
  type MediaType,
} from '@app-template/domain/attachment'
import type * as Wire from '@app-template/http-api'
import {
  Api,
  AttachmentMediaType,
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
  CurrentUser,
  limits,
  RequestInvalidError,
  type RequestIssue,
} from '@app-template/http-api'

export const toAttachment = (attachment: AttachmentModel): Wire.Attachment =>
  Struct.pick(attachment, ['id', 'messageId', 'fileName', 'mediaType', 'size', 'createdAt'])

const buildRequestInvalid = (path: RequestIssue['path'], message: string) =>
  new RequestInvalidError({ issues: [{ path, message }] })

type UploadRefusal = AttachmentTooLargeError | RequestInvalidError

const refuseMultipart = {
  FileTooLarge: () => Effect.fail(new AttachmentTooLargeError()),
  BodyTooLarge: () => Effect.fail(new AttachmentTooLargeError()),
  FieldTooLarge: () => Effect.fail(buildRequestInvalid(['files'], 'Expected a file, not a field')),
  TooManyParts: () =>
    Effect.fail(
      buildRequestInvalid(['files'], `Expected at most ${limits.attachment.maxFiles} files`),
    ),
  Parse: () => Effect.fail(buildRequestInvalid([], 'Expected a multipart body')),
  InternalError: (error) => Effect.die(error),
} as const satisfies Record<
  Multipart.MultipartErrorReason['_tag'],
  (error: Multipart.MultipartError) => Effect.Effect<never, UploadRefusal>
>

const matchesExtension = (file: Multipart.File) => (mediaType: MediaType) =>
  Option.getOrElse(Mime.getType(file.name), () => mediaType) === mediaType

const decodeDeclaredType = (file: Multipart.File) =>
  Schema.decodeUnknownEffect(AttachmentMediaType)(file.contentType).pipe(
    Effect.filterOrFail(matchesExtension(file)),
    Effect.mapError(() => new AttachmentTypeUnsupportedError()),
  )

const bufferFile = Effect.fnUntraced(function* (part: Multipart.Part, index: number) {
  if (!Multipart.isFile(part))
    return yield* buildRequestInvalid(['files', index], 'Expected a file')
  const fileName = yield* Schema.decodeUnknownEffect(FileName)(part.name).pipe(
    Effect.mapError(() => buildRequestInvalid(['files', index], 'Expected a file name')),
  )
  const mediaType = yield* decodeDeclaredType(part)
  return { fileName, mediaType, bytes: yield* part.contentEffect }
})

const unquotable = /[^\x20\x21\x23-\x5b\x5d-\x7e]/g

const encodeExtValue = (value: string) =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )

// A header value must be ASCII (Bun answers 500 otherwise), so a name that does not fit a quoted
// string travels in `filename*` beside an ASCII fallback.
const buildInlineDisposition = (fileName: string) => {
  const fallback = fileName.replace(unquotable, '_')
  return fallback === fileName
    ? `inline; filename="${fileName}"`
    : `inline; filename="${fallback}"; filename*=UTF-8''${encodeExtValue(fileName)}`
}

export const AttachmentHandler = HttpApiBuilder.group(
  Api,
  'attachments',
  Effect.fnUntraced(function* (handlers) {
    const attachments = yield* AttachmentService

    return handlers
      .handle(
        'upload',
        Effect.fn('AttachmentHandler.upload')(function* ({ payload }) {
          const user = yield* CurrentUser
          const files = yield* payload.pipe(
            Stream.mapEffect(bufferFile),
            Stream.runCollect,
            Effect.catchTag(
              'MultipartError',
              (error): Effect.Effect<never, UploadRefusal> =>
                refuseMultipart[error.reason._tag](error),
            ),
            Effect.filterOrFail(Arr.isReadonlyArrayNonEmpty, () =>
              buildRequestInvalid(['files'], 'Expected at least 1 file'),
            ),
          )
          const uploaded = yield* Effect.forEach(files, (file) => attachments.upload(user.id, file))
          return Arr.map(uploaded, toAttachment)
        }),
      )
      .handle(
        'get',
        Effect.fn('AttachmentHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          return toAttachment(yield* attachments.get(user.id, params.attachmentId))
        }),
      )
      .handleRaw(
        'download',
        Effect.fn('AttachmentHandler.download')(function* ({ params }) {
          const user = yield* CurrentUser
          const { attachment, bytes } = yield* attachments.download(user.id, params.attachmentId)
          return HttpServerResponse.uint8Array(bytes, {
            contentType: attachment.mediaType,
            headers: { 'content-disposition': buildInlineDisposition(attachment.fileName) },
          })
        }),
      )
      .handle(
        'delete',
        Effect.fn('AttachmentHandler.delete')(function* ({ params }) {
          const user = yield* CurrentUser
          yield* attachments.delete(user.id, params.attachmentId)
        }),
      )
  }),
)
