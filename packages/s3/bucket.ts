import { S3Service } from '@effect-aws/client-s3'
import {
  Array as Arr,
  Bytes,
  Context,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  Number as Num,
  Option,
  Predicate,
  pipe,
  Sink,
  Stream,
} from 'effect'

export interface PutOptions {
  readonly contentType: string
  /**
   * Sent as `Content-Disposition: inline; filename*=UTF-8''…` (RFC 6266 with RFC 8187), so any
   * name survives as ASCII.
   */
  readonly fileName?: string
  readonly tags?: Record<string, string>
}

/** The S3 minimum for every part but the last. */
const partSize = 5 * 1024 * 1024

interface UploadState {
  /** The latest part, held back until the next one proves it is not the last. */
  readonly held: Option.Option<Uint8Array>
  readonly uploadId: Option.Option<string>
  readonly parts: ReadonlyArray<{ readonly PartNumber: number; readonly ETag: string | undefined }>
  readonly size: number
}

const initialUploadState: UploadState = {
  held: Option.none(),
  uploadId: Option.none(),
  parts: [],
  size: 0,
}

const buildInlineDisposition = (fileName: string) => {
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `inline; filename*=UTF-8''${encoded}`
}

const buildTagging = (tags: Record<string, string>) => new URLSearchParams(tags).toString()

const buildObjectHeaders = ({ contentType, fileName, tags }: PutOptions) => ({
  ContentType: contentType,
  ContentDisposition: Option.fromNullishOr(fileName).pipe(
    Option.map(buildInlineDisposition),
    Option.getOrUndefined,
  ),
  Tagging: Option.fromNullishOr(tags).pipe(Option.map(buildTagging), Option.getOrUndefined),
})

const sizeOf = (chunks: ReadonlyArray<Uint8Array>) =>
  Num.sumAll(Arr.map(chunks, (chunk) => chunk.length))

const appendChunk = (chunks: ReadonlyArray<Uint8Array>, chunk: Uint8Array) =>
  Effect.succeed(Arr.append(chunks, chunk))

const hasBytes = (bytes: Uint8Array) => bytes.length > 0

/**
 * Parts of at least `partSize`, the last one alone shorter.
 *
 * The transducer emits an empty group when the stream ends right after a part is cut, so a
 * content of exactly `partSize` would gain an empty second part without the filter.
 */
const cutParts = <E>(content: Stream.Stream<Uint8Array, E>): Stream.Stream<Uint8Array, E> =>
  content.pipe(
    Stream.transduce(
      Sink.fold(Arr.empty<Uint8Array>, (held) => sizeOf(held) < partSize, appendChunk),
    ),
    Stream.map(Bytes.concat),
    Stream.filter(hasBytes),
  )

/**
 * `deleteObjectTagging` types its error as a bare `S3ServiceError`, so `catchTag` cannot name
 * `NoSuchKey`; a missing key still arrives with that tag.
 */
const isNoSuchKey = (error: unknown): boolean => Predicate.isTagged(error, 'NoSuchKey')

/** `Quiet` answers only the keys it failed on; a missing key is no failure. */
const hasKeptKeys = ({ Errors }: { readonly Errors?: ReadonlyArray<unknown> | undefined }) =>
  Option.fromNullishOr(Errors).pipe(Option.exists(Arr.isReadonlyArrayNonEmpty))

/** The most keys one `DeleteObjects` request takes. */
const deleteBatchSize = 1000

export class S3Bucket extends Context.Service<
  S3Bucket,
  {
    /**
     * One `PutObject` while the content fits one part, else a multipart upload that a failed
     * stream aborts, leaving no object; answers the byte count.
     */
    readonly put: <E>(
      key: string,
      content: Stream.Stream<Uint8Array, E>,
      options: PutOptions,
    ) => Effect.Effect<number, E>
    readonly get: (key: string) => Effect.Effect<Option.Option<Uint8Array>>
    readonly exists: (key: string) => Effect.Effect<boolean>
    /** A presigned GET valid for `lifetime`; none for a missing key. */
    readonly url: (key: string, lifetime: Duration.Duration) => Effect.Effect<Option.Option<URL>>
    /** Idempotent, a no-op for a missing key. */
    readonly untag: (key: string) => Effect.Effect<void>
    /** Idempotent. */
    readonly delete: (key: string) => Effect.Effect<void>
    /** Idempotent; one request per 1000 keys, none for no key. */
    readonly deleteMany: (keys: ReadonlyArray<string>) => Effect.Effect<void>
  }
>()('@app-template/s3/S3Bucket', {
  make: ({ bucket }: { readonly bucket: string }) =>
    Effect.gen(function* () {
      const s3 = yield* S3Service

      const buildObjectRef = (key: string) => ({ Bucket: bucket, Key: key })

      const createUpload = (key: string, options: PutOptions) => {
        const ref = buildObjectRef(key)
        const headers = buildObjectHeaders(options)

        const abortUnlessCompleted = (uploadId: string, exit: Exit.Exit<unknown, unknown>) => {
          if (Exit.isSuccess(exit)) return Effect.void
          return s3.abortMultipartUpload({ ...ref, UploadId: uploadId }).pipe(Effect.orDie)
        }

        const openUpload = Effect.acquireRelease(
          s3
            .createMultipartUpload({ ...ref, ...headers })
            .pipe(Effect.flatMap(({ UploadId }) => Effect.fromNullishOr(UploadId))),
          abortUnlessCompleted,
        )

        /** Opens the multipart upload on the first part; the fold's scope aborts it on a failure. */
        const sendPart = Effect.fnUntraced(function* (state: UploadState, bytes: Uint8Array) {
          const uploadId = yield* Option.match(state.uploadId, {
            onNone: () => openUpload,
            onSome: Effect.succeed,
          })
          const PartNumber = state.parts.length + 1
          const { ETag } = yield* s3.uploadPart({
            ...ref,
            UploadId: uploadId,
            PartNumber,
            Body: bytes,
          })
          return {
            ...state,
            uploadId: Option.some(uploadId),
            parts: Arr.append(state.parts, { PartNumber, ETag }),
          }
        })

        const receivePart = Effect.fnUntraced(function* (state: UploadState, bytes: Uint8Array) {
          const size = state.size + bytes.length
          if (Option.isNone(state.held)) return { ...state, held: Option.some(bytes), size }

          const sent = yield* sendPart(state, state.held.value)
          return { ...sent, held: Option.some(bytes), size }
        }, Effect.orDie)

        // Runs only after the stream ended: a part held back on a failure stays unsent.
        const finishUpload = Effect.fnUntraced(function* (state: UploadState) {
          const last = Option.getOrElse(state.held, () => new Uint8Array())
          if (Option.isNone(state.uploadId)) {
            yield* s3.putObject({ ...ref, ...headers, Body: last })
            return state.size
          }

          const sent = yield* sendPart(state, last)
          yield* s3.completeMultipartUpload({
            ...ref,
            UploadId: state.uploadId.value,
            MultipartUpload: { Parts: Arr.copy(sent.parts) },
          })
          return state.size
        }, Effect.orDie)

        return { receivePart, finishUpload }
      }

      const put = Effect.fn('S3Bucket.put')(
        <E>(key: string, content: Stream.Stream<Uint8Array, E>, options: PutOptions) => {
          const upload = createUpload(key, options)
          return content.pipe(
            cutParts,
            Stream.runFoldEffect(() => initialUploadState, upload.receivePart),
            Effect.flatMap(upload.finishUpload),
            Effect.scoped,
          )
        },
      )

      const get = Effect.fn('S3Bucket.get')((key: string) =>
        s3.getObject(buildObjectRef(key)).pipe(
          Effect.flatMap(({ Body }) => Effect.fromNullishOr(Body)),
          Effect.flatMap((body) => Effect.promise(() => body.transformToByteArray())),
          Effect.map(Option.some),
          Effect.catchTag('NoSuchKey', () => Effect.succeedNone),
          Effect.orDie,
        ),
      )

      const exists = Effect.fn('S3Bucket.exists')((key: string) =>
        s3.headObject(buildObjectRef(key)).pipe(
          Effect.as(true),
          Effect.catchTag('NotFound', () => Effect.succeed(false)),
          Effect.orDie,
        ),
      )

      // Presigning never checks that the object exists.
      const url = Effect.fn('S3Bucket.url')(function* (key: string, lifetime: Duration.Duration) {
        const found = yield* exists(key)
        if (!found) return Option.none()

        const now = yield* DateTime.nowAsDate
        const signed = yield* s3
          .getObject(buildObjectRef(key), {
            presigned: true,
            expiresIn: Duration.toSeconds(lifetime),
            signingDate: now,
          })
          .pipe(Effect.orDie)
        return Option.some(new URL(signed))
      })

      const untag = Effect.fn('S3Bucket.untag')((key: string) =>
        s3.deleteObjectTagging(buildObjectRef(key)).pipe(
          Effect.catchIf(isNoSuchKey, () => Effect.void),
          Effect.asVoid,
          Effect.orDie,
        ),
      )

      const remove = Effect.fn('S3Bucket.delete')((key: string) =>
        s3.deleteObject(buildObjectRef(key)).pipe(Effect.asVoid, Effect.orDie),
      )

      const deleteBatch = (keys: Arr.NonEmptyReadonlyArray<string>) =>
        s3
          .deleteObjects({
            Bucket: bucket,
            Delete: { Objects: Arr.map(keys, (Key) => ({ Key })), Quiet: true },
          })
          .pipe(
            Effect.filterOrFail(
              Predicate.not(hasKeptKeys),
              ({ Errors }) => new Error('S3 kept keys asked to delete', { cause: Errors }),
            ),
            Effect.asVoid,
            Effect.orDie,
          )

      const deleteMany = Effect.fn('S3Bucket.deleteMany')((keys: ReadonlyArray<string>) =>
        pipe(keys, Arr.chunksOf(deleteBatchSize), Effect.forEach(deleteBatch, { discard: true })),
      )

      return { put, get, exists, url, untag, delete: remove, deleteMany }
    }),
}) {
  static readonly layer = (options: {
    readonly bucket: string
  }): Layer.Layer<S3Bucket, never, S3Service> => Layer.effect(this, this.make(options))
}
