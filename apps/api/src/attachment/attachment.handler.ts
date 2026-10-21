import { Array as Arr, Effect, Option, Ref, Schema, Stream } from 'effect'
import { HttpServerResponse, Mime, Multipart } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'

import { AttachmentService } from '@app-template/application/attachment'
import { type Attachment, FileName, type MediaType } from '@app-template/domain/attachment'
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

import { toAttachment } from '#api/shared/projections'

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

const readFile = Effect.fnUntraced(function* (part: Multipart.Part, index: number) {
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
          const stored = yield* Ref.make(Arr.empty<Attachment>())

          // Each part streams into the store before the parser reaches the next one, so a part
          // refused later finds the earlier ones stored: they are removed, as one request.
          const discardStored = Effect.flatMap(Ref.get(stored), (earlier) =>
            Effect.forEach(
              earlier,
              (attachment) => Effect.orDie(attachments.delete(user.id, attachment.id)),
              { discard: true },
            ),
          )

          const uploaded = yield* payload.pipe(
            Stream.mapEffect((part, index) =>
              Effect.flatMap(readFile(part, index), (file) => attachments.upload(user.id, file)),
            ),
            Stream.tap((attachment) => Ref.update(stored, Arr.append(attachment))),
            Stream.runCollect,
            Effect.catchTag(
              'MultipartError',
              (error): Effect.Effect<never, UploadRefusal> =>
                refuseMultipart[error.reason._tag](error),
            ),
            Effect.filterOrFail(Arr.isReadonlyArrayNonEmpty, () =>
              buildRequestInvalid(['files'], 'Expected at least 1 file'),
            ),
            Effect.onError(() => discardStored),
          )

          return Arr.map(uploaded, toAttachment)
        }),
      )
      .handle(
        'get',
        Effect.fn('AttachmentHandler.get')(function* ({ params }) {
          const user = yield* CurrentUser
          const attachment = yield* attachments.get(user.id, params.attachmentId)
          return toAttachment(attachment)
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
