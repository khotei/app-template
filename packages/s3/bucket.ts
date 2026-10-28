import { S3Service } from '@effect-aws/client-s3'
import {
  Array as Arr,
  ByteSize,
  Bytes,
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Number as Num,
  Option,
  Predicate,
  Sink,
  Stream,
} from 'effect'

export interface PutOptions {
  readonly contentType: string
  /** Sent as `Content-Disposition: inline; filename*=UTF-8''…`, so any name survives as ASCII. */
  readonly fileName?: string
  readonly tags?: Record<string, string>
}

export interface S3BucketOptions {
  readonly bucket: string
  /** Every part but the last is at least this big; S3 refuses a part under 5 MiB. */
  readonly partSize?: ByteSize.ByteSize
}

const defaultPartSize = ByteSize.mebibytes(5)

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

/** RFC 6266 with RFC 8187's `filename*`, so any file name survives as ASCII. */
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
const cutParts =
  (partSize: number) =>
  <E>(content: Stream.Stream<Uint8Array, E>): Stream.Stream<Uint8Array, E> =>
    content.pipe(
      Stream.transduce(
        Sink.fold(Arr.empty<Uint8Array>, (held) => sizeOf(held) < partSize, appendChunk),
      ),
      Stream.map(Bytes.concat),
      Stream.filter(hasBytes),
    )

/** Typed as a bare `S3ServiceError`, a missing key still arrives tagged `NoSuchKey`. */
const isNoSuchKey = (error: unknown): boolean => Predicate.isTagged(error, 'NoSuchKey')

const makeBucket = ({ bucket, partSize = defaultPartSize }: S3BucketOptions) =>
  Effect.gen(function* () {
    const s3 = yield* S3Service

    const buildObjectRef = (key: string) => ({ Bucket: bucket, Key: key })

    const abortUnlessCompleted =
      (key: string) => (uploadId: string, exit: Exit.Exit<unknown, unknown>) =>
        s3
          .abortMultipartUpload({ ...buildObjectRef(key), UploadId: uploadId })
          .pipe(Effect.orDie, Effect.when(Effect.succeed(Exit.isFailure(exit))))

    const openUpload = (key: string, options: PutOptions) =>
      Effect.acquireRelease(
        s3
          .createMultipartUpload({ ...buildObjectRef(key), ...buildObjectHeaders(options) })
          .pipe(Effect.flatMap(({ UploadId }) => Effect.fromNullishOr(UploadId))),
        abortUnlessCompleted(key),
      )

    /** Opens the multipart upload on the first part; the fold's scope aborts it on a failure. */
    const sendPart = (key: string, options: PutOptions) =>
      Effect.fnUntraced(function* (state: UploadState, bytes: Uint8Array) {
        const uploadId = yield* Option.match(state.uploadId, {
          onNone: () => openUpload(key, options),
          onSome: Effect.succeed,
        })
        const PartNumber = state.parts.length + 1
        const { ETag } = yield* s3.uploadPart({
          ...buildObjectRef(key),
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

    const receivePart = (key: string, options: PutOptions) =>
      Effect.fnUntraced(function* (state: UploadState, bytes: Uint8Array) {
        const size = state.size + bytes.length
        if (Option.isNone(state.held)) return { ...state, held: Option.some(bytes), size }

        const sent = yield* sendPart(key, options)(state, state.held.value)
        return { ...sent, held: Option.some(bytes), size }
      }, Effect.orDie)

    // Runs only after the stream ended: a part held back on a failure stays unsent.
    const finishUpload = (key: string, options: PutOptions) =>
      Effect.fnUntraced(function* (state: UploadState) {
        const last = Option.getOrElse(state.held, () => new Uint8Array())
        if (Option.isNone(state.uploadId)) {
          yield* s3.putObject({
            ...buildObjectRef(key),
            ...buildObjectHeaders(options),
            Body: last,
          })
          return state.size
        }

        const sent = yield* sendPart(key, options)(state, last)
        yield* s3.completeMultipartUpload({
          ...buildObjectRef(key),
          UploadId: state.uploadId.value,
          MultipartUpload: { Parts: Arr.copy(sent.parts) },
        })
        return state.size
      }, Effect.orDie)

    const put = Effect.fn('S3Bucket.put')(
      <E>(key: string, content: Stream.Stream<Uint8Array, E>, options: PutOptions) =>
        content.pipe(
          cutParts(ByteSize.toNumberUnsafe(partSize)),
          Stream.runFoldEffect(() => initialUploadState, receivePart(key, options)),
          Effect.flatMap(finishUpload(key, options)),
          Effect.scoped,
        ),
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

      const now = yield* Clock.currentTimeMillis
      const signed = yield* s3
        .getObject(buildObjectRef(key), {
          presigned: true,
          expiresIn: Duration.toSeconds(lifetime),
          signingDate: new Date(now),
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

    return S3Bucket.of({ put, get, exists, url, untag, delete: remove })
  })

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
  }
>()('@app-template/s3/S3Bucket') {
  static readonly layer = (options: S3BucketOptions): Layer.Layer<S3Bucket, never, S3Service> =>
    Layer.effect(this, makeBucket(options))
}
