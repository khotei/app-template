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
  String as Str,
  Stream,
} from 'effect'

export interface PutOptions {
  readonly contentType: string
  /**
   * Sent as `Content-Disposition: inline; filename*=UTF-8''…` (RFC 6266 with RFC 8187), so any
   * name survives as ASCII.
   */
  readonly fileName?: string
}

/** What `put` wrote of the object's options; the name is none when it was put without one. */
export interface ObjectHead {
  readonly contentType: string
  readonly fileName: Option.Option<string>
}

/** An object's headers: what `put` writes of its options and what a read decodes of them. */
class ObjectHeader {
  static readonly buildInlineDisposition = (fileName: string) => {
    const encoded = encodeURIComponent(fileName).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    return `inline; filename*=UTF-8''${encoded}`
  }

  static readonly inlineFileName = /^inline; filename\*=UTF-8''(.*)$/

  static readonly buildInlineFileName = (disposition: string | undefined): Option.Option<string> =>
    Option.fromNullishOr(disposition).pipe(
      Option.flatMap(Str.match(ObjectHeader.inlineFileName)),
      Option.flatMap(Arr.get(1)),
      Option.map(decodeURIComponent),
    )

  static readonly decode = ({
    ContentType,
    ContentDisposition,
  }: {
    readonly ContentType?: string | undefined
    readonly ContentDisposition?: string | undefined
  }) =>
    Effect.fromNullishOr(ContentType).pipe(
      Effect.map(
        (contentType): ObjectHead => ({
          contentType,
          fileName: ObjectHeader.buildInlineFileName(ContentDisposition),
        }),
      ),
    )

  static readonly build = ({ contentType, fileName }: PutOptions) => ({
    ContentType: contentType,
    ContentDisposition: Option.fromNullishOr(fileName).pipe(
      Option.map(ObjectHeader.buildInlineDisposition),
      Option.getOrUndefined,
    ),
  })
}

interface UploadState {
  /** The latest part, held back until the next one proves it is not the last. */
  readonly held: Option.Option<Uint8Array>
  readonly uploadId: Option.Option<string>
  readonly parts: ReadonlyArray<{ readonly PartNumber: number; readonly ETag: string | undefined }>
  readonly size: number
}

/** An upload's parts: their size, the state their fold starts from and how the content is cut. */
class ObjectUpload {
  /** The S3 minimum for every part but the last. */
  static readonly partSize = 5 * 1024 * 1024

  static readonly initialState: UploadState = {
    held: Option.none(),
    uploadId: Option.none(),
    parts: [],
    size: 0,
  }

  static readonly countBytes = (chunks: ReadonlyArray<Uint8Array>) =>
    pipe(
      chunks,
      Arr.map((chunk) => chunk.length),
      Num.sumAll,
    )

  static readonly hasBytes = (bytes: Uint8Array) => bytes.length > 0

  /**
   * Parts of at least `partSize`, the last one alone shorter.
   *
   * The transducer emits an empty group when the stream ends right after a part is cut, so a
   * content of exactly `partSize` would gain an empty second part without the filter.
   */
  static readonly cutParts = <E>(
    content: Stream.Stream<Uint8Array, E>,
  ): Stream.Stream<Uint8Array, E> =>
    content.pipe(
      Stream.transduce(
        Sink.reduceWhile(
          Arr.empty<Uint8Array>,
          (held) => ObjectUpload.countBytes(held) < ObjectUpload.partSize,
          (held, chunk) => Arr.append(held, chunk),
        ),
      ),
      Stream.map(Bytes.concat),
      Stream.filter(ObjectUpload.hasBytes),
    )
}

/** A delete of many keys: how many one request takes and whether S3 kept any. */
class ObjectDelete {
  /** The most keys one `DeleteObjects` request takes. */
  static readonly batchSize = 1000

  /** `Quiet` returns only the keys it failed on; a missing key is no failure. */
  static readonly hasKeptKeys = ({
    Errors,
  }: {
    readonly Errors?: ReadonlyArray<unknown> | undefined
  }) => Option.fromNullishOr(Errors).pipe(Option.exists(Arr.isReadonlyArrayNonEmpty))
}

const readBody = Effect.fnUntraced(function* ({
  Body,
}: {
  readonly Body?: { transformToByteArray(): Promise<Uint8Array> }
}) {
  const body = yield* Effect.fromNullishOr(Body)
  return yield* Effect.promise(() => body.transformToByteArray())
})

export class S3Bucket extends Context.Service<
  S3Bucket,
  {
    /**
     * One `PutObject` while the content fits one part, else a multipart upload that a failed
     * stream aborts, leaving no object; returns the byte count.
     */
    readonly put: <E>(
      key: string,
      content: Stream.Stream<Uint8Array, E>,
      options: PutOptions,
    ) => Effect.Effect<number, E>
    /** One `GetObject`; none for a missing key. */
    readonly download: (
      key: string,
    ) => Effect.Effect<Option.Option<{ readonly head: ObjectHead; readonly blob: Uint8Array }>>
    /** One `HeadObject`; none for a missing key. */
    readonly head: (key: string) => Effect.Effect<Option.Option<ObjectHead>>
    /** A presigned GET valid for `lifetime`, signed without a request: it never checks that the key exists. */
    readonly url: (key: string, lifetime: Duration.Duration) => Effect.Effect<URL>
    /** Idempotent; one request per 1000 keys, none for no key. */
    readonly deleteMany: (keys: ReadonlyArray<string>) => Effect.Effect<void>
  }
>()('@app-template/packages/aws/s3/S3Bucket', {
  make: Effect.fnUntraced(function* ({ bucket }: { readonly bucket: string }) {
    const s3 = yield* S3Service

    const buildObjectRef = (key: string) => ({ Bucket: bucket, Key: key })

    function createUpload(key: string, options: PutOptions) {
      const ref = buildObjectRef(key)
      const headers = ObjectHeader.build(options)

      const openUpload = Effect.acquireRelease(
        s3
          .createMultipartUpload({ ...ref, ...headers })
          .pipe(Effect.flatMap(({ UploadId }) => Effect.fromNullishOr(UploadId))),
        function abortUnlessCompleted(uploadId, exit) {
          if (Exit.isSuccess(exit)) return Effect.void
          return s3.abortMultipartUpload({ ...ref, UploadId: uploadId }).pipe(Effect.orDie)
        },
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

    const put = Effect.fn('S3Bucket.put')(function* <E>(
      key: string,
      content: Stream.Stream<Uint8Array, E>,
      options: PutOptions,
    ) {
      const upload = createUpload(key, options)
      const state = yield* content.pipe(
        ObjectUpload.cutParts,
        Stream.runFoldEffect(() => ObjectUpload.initialState, upload.receivePart),
      )
      return yield* upload.finishUpload(state)
    }, Effect.scoped)

    const download = Effect.fn('S3Bucket.download')(
      (key: string) => s3.getObject(buildObjectRef(key)),
      Effect.flatMap((object) =>
        Effect.all({ head: ObjectHeader.decode(object), blob: readBody(object) }),
      ),
      Effect.asSome,
      Effect.catchTag('NoSuchKey', () => Effect.succeedNone),
      Effect.orDie,
    )

    const head = Effect.fn('S3Bucket.head')(
      (key: string) => s3.headObject(buildObjectRef(key)),
      Effect.flatMap(ObjectHeader.decode),
      Effect.asSome,
      Effect.catchTag('NotFound', () => Effect.succeedNone),
      Effect.orDie,
    )

    const url = Effect.fn('S3Bucket.url')(function* (key: string, lifetime: Duration.Duration) {
      const now = yield* DateTime.nowAsDate
      const signed = yield* s3.getObject(buildObjectRef(key), {
        presigned: true,
        expiresIn: Duration.toSeconds(lifetime),
        signingDate: now,
      })
      return new URL(signed)
    }, Effect.orDie)

    const deleteBatch = (keys: Arr.NonEmptyReadonlyArray<string>) =>
      s3
        .deleteObjects({
          Bucket: bucket,
          Delete: { Objects: Arr.map(keys, (Key) => ({ Key })), Quiet: true },
        })
        .pipe(
          Effect.filterOrFail(
            Predicate.not(ObjectDelete.hasKeptKeys),
            ({ Errors }) => new Error('S3 kept keys asked to delete', { cause: Errors }),
          ),
          Effect.asVoid,
          Effect.orDie,
        )

    const deleteMany = Effect.fn('S3Bucket.deleteMany')((keys: ReadonlyArray<string>) =>
      pipe(
        keys,
        Arr.chunksOf(ObjectDelete.batchSize),
        Effect.forEach(deleteBatch, { discard: true }),
      ),
    )

    return { put, download, head, url, deleteMany }
  }),
}) {
  static readonly layer = (options: {
    readonly bucket: string
  }): Layer.Layer<S3Bucket, never, S3Service> => Layer.effect(this, this.make(options))
}
