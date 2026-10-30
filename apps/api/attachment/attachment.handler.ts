import { Array as Arr, Effect, Option, Schema, Stream } from 'effect'
import { HttpServerResponse, Mime, Multipart } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'

import { AttachmentService, FileName, type MediaType } from '@app-template/domain/attachment'
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
  Mime.getType(file.name).pipe(Option.getOrElse(() => mediaType)) === mediaType

const decodeDeclaredType = (file: Multipart.File) =>
  Schema.decodeUnknownEffect(AttachmentMediaType)(file.contentType).pipe(
    Effect.filterOrFail(matchesExtension(file)),
    Effect.mapError(() => new AttachmentTypeUnsupportedError()),
  )

const decodeUpload = Effect.fnUntraced(function* (part: Multipart.Part, index: number) {
  if (!Multipart.isFile(part))
    return yield* buildRequestInvalid(['files', index], 'Expected a file')
  const fileName = yield* Schema.decodeUnknownEffect(FileName)(part.name).pipe(
    Effect.mapError(() => buildRequestInvalid(['files', index], 'Expected a file name')),
  )
  const mediaType = yield* decodeDeclaredType(part)
  return { fileName, mediaType, content: part.content }
})

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

          return yield* attachments.upload(user.id, Stream.mapEffect(payload, decodeUpload)).pipe(
            Effect.catchTag(
              'MultipartError',
              (error): Effect.Effect<never, UploadRefusal> =>
                refuseMultipart[error.reason._tag](error),
            ),
            Effect.filterOrFail(Arr.isReadonlyArrayNonEmpty, () =>
              buildRequestInvalid(['files'], 'Expected at least 1 file'),
            ),
          )
        }),
      )
      .handle(
        'get',
        Effect.fn('AttachmentHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          return yield* attachments.get(user.id, params.attachmentId)
        }),
      )
      .handleRaw(
        'download',
        Effect.fn('AttachmentHandler.download')(function* ({ params }) {
          const user = yield* CurrentUser
          const { url } = yield* attachments.download(user.id, params.attachmentId)
          return HttpServerResponse.redirect(url)
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
