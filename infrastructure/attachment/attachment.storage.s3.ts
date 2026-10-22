import { S3Service } from '@effect-aws/client-s3'
import {
  Array as Arr,
  Clock,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Stream,
} from 'effect'

import { buildResourceName, resources, unboundTag } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
import {
  type AttachmentId,
  type AttachmentMeta,
  AttachmentStore,
  type FileName,
  FileSize,
} from '@app-template/domain/attachment'

/** The S3 minimum for every part but the last; with the 10 MiB cap a file takes two at most. */
const partSize = 5 * 1024 * 1024
const urlLifetime = Duration.minutes(5)

interface Held {
  readonly chunks: ReadonlyArray<Uint8Array>
  readonly size: number
}

interface Written {
  readonly size: number
  readonly held: Held
  readonly upload: Option.Option<{ readonly UploadId?: string | undefined }>
  readonly parts: ReadonlyArray<{ readonly PartNumber: number; readonly ETag: string | undefined }>
}

const nothingWritten = (): Written => ({
  size: 0,
  held: { chunks: [], size: 0 },
  upload: Option.none(),
  parts: [],
})

const concatBytes = ({ chunks, size }: Held) => {
  const bytes = new Uint8Array(size)
  Arr.reduce(chunks, 0, (offset, chunk) => {
    bytes.set(chunk, offset)
    return offset + chunk.length
  })
  return bytes
}

/**
 * Splits off the full parts that more bytes follow, so the bytes held back are the last part
 * whenever the stream ends: a file of exactly `partSize` stays one `PutObject`.
 */
const splitFullParts = (held: Held): readonly [ReadonlyArray<Uint8Array>, Held] => {
  if (held.size <= partSize) return [[], held]

  const bytes = concatBytes(held)
  const count = Math.ceil(held.size / partSize) - 1
  const parts = Arr.makeBy(count, (index) =>
    bytes.subarray(index * partSize, (index + 1) * partSize),
  )
  const rest = bytes.subarray(count * partSize)
  return [parts, { chunks: [rest], size: rest.length }]
}

/** RFC 6266 with RFC 8187's `filename*`, so any file name survives as ASCII. */
const buildInlineDisposition = (fileName: FileName) => {
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `inline; filename*=UTF-8''${encoded}`
}

/** Typed as a bare `S3ServiceError`, a missing key still arrives tagged `NoSuchKey`. */
const isNoSuchKey = (error: unknown): boolean => Predicate.isTagged(error, 'NoSuchKey')

export const AttachmentStoreS3 = Layer.effect(
  AttachmentStore,
  Effect.gen(function* () {
    const s3 = yield* S3Service
    const { stage } = yield* AwsConfig
    const bucket = buildResourceName(stage, resources.buckets.attachments.name)

    const locate = (id: AttachmentId) => ({ Bucket: bucket, Key: `attachments/${id}` })

    const describe = (meta: AttachmentMeta) => ({
      ContentType: meta.mediaType,
      ContentDisposition: buildInlineDisposition(meta.fileName),
    })

    /** Aborted unless the insert succeeds, so a failed or interrupted one leaves no parts. */
    const startUpload = (id: AttachmentId, meta: AttachmentMeta) =>
      Effect.acquireRelease(
        s3.createMultipartUpload({ ...locate(id), ...describe(meta) }),
        ({ UploadId }, exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : s3.abortMultipartUpload({ ...locate(id), UploadId }).pipe(Effect.orDie),
      )

    const sendPart = Effect.fnUntraced(function* (
      id: AttachmentId,
      meta: AttachmentMeta,
      written: Written,
      bytes: Uint8Array,
    ) {
      const upload = yield* Option.match(written.upload, {
        onNone: () => startUpload(id, meta),
        onSome: Effect.succeed,
      })
      const PartNumber = written.parts.length + 1

      const { ETag } = yield* s3.uploadPart({
        ...locate(id),
        UploadId: upload.UploadId,
        PartNumber,
        Body: bytes,
      })
      return {
        ...written,
        upload: Option.some(upload),
        parts: Arr.append(written.parts, { PartNumber, ETag }),
      }
    })

    const receive = Effect.fnUntraced(function* (
      id: AttachmentId,
      meta: AttachmentMeta,
      written: Written,
      chunk: Uint8Array,
    ) {
      const [full, held] = splitFullParts({
        chunks: Arr.append(written.held.chunks, chunk),
        size: written.held.size + chunk.length,
      })

      const sent = yield* Effect.reduce(
        full,
        () => written,
        (state, bytes) => sendPart(id, meta, state, bytes),
      )
      return { ...sent, held, size: written.size + chunk.length }
    }, Effect.orDie)

    /** Runs once the stream has ended, so a failing stream never stores its last bytes. */
    const finish = Effect.fnUntraced(function* (
      id: AttachmentId,
      meta: AttachmentMeta,
      written: Written,
    ) {
      const last = concatBytes(written.held)
      const tag = { Key: unboundTag.key, Value: unboundTag.value }

      if (Option.isNone(written.upload)) {
        return yield* s3.putObject({
          ...locate(id),
          ...describe(meta),
          Body: last,
          Tagging: `${tag.Key}=${tag.Value}`,
        })
      }

      const { UploadId } = written.upload.value
      const sent = yield* sendPart(id, meta, written, last)
      yield* s3.completeMultipartUpload({
        ...locate(id),
        UploadId,
        MultipartUpload: { Parts: [...sent.parts] },
      })
      // MiniStack ignores `Tagging` on CreateMultipartUpload, so the tag follows the complete.
      return yield* s3.putObjectTagging({ ...locate(id), Tagging: { TagSet: [tag] } })
    }, Effect.orDie)

    const insert = Effect.fn('AttachmentStore.insert')(function* <E>(
      id: AttachmentId,
      content: Stream.Stream<Uint8Array, E>,
      meta: AttachmentMeta,
    ) {
      const written = yield* Stream.runFoldEffect(content, nothingWritten, (state, chunk) =>
        receive(id, meta, state, chunk),
      )

      yield* finish(id, meta, written)
      return FileSize.make(written.size)
    }, Effect.scoped)

    const select = Effect.fn('AttachmentStore.select')(function* (id: AttachmentId) {
      const found = yield* s3.getObject(locate(id)).pipe(
        Effect.map(Option.some),
        Effect.catchTag('NoSuchKey', () => Effect.succeedNone),
        Effect.orDie,
      )
      const read = Option.map(found, ({ Body }) =>
        Effect.promise(async () => (await Body?.transformToByteArray()) ?? new Uint8Array()),
      )
      return yield* Effect.transposeOption(read)
    })

    /** Heads the object first: presigning never looks, and the port answers none for no bytes. */
    const url = Effect.fn('AttachmentStore.url')(function* (id: AttachmentId) {
      const exists = yield* s3.headObject(locate(id)).pipe(
        Effect.as(true),
        Effect.catchTag('NotFound', () => Effect.succeed(false)),
        Effect.orDie,
      )
      if (!exists) return Option.none()

      const now = yield* Clock.currentTimeMillis
      const signed = yield* s3
        .getObject(locate(id), {
          presigned: true,
          expiresIn: Duration.toSeconds(urlLifetime),
          signingDate: new Date(now),
        })
        .pipe(Effect.orDie)
      return Option.some(new URL(signed))
    })

    const keep = Effect.fn('AttachmentStore.keep')((id: AttachmentId) =>
      s3.deleteObjectTagging(locate(id)).pipe(
        Effect.catchIf(isNoSuchKey, () => Effect.void),
        Effect.asVoid,
        Effect.orDie,
      ),
    )

    const remove = Effect.fn('AttachmentStore.delete')((id: AttachmentId) =>
      s3.deleteObject(locate(id)).pipe(Effect.asVoid, Effect.orDie),
    )

    return AttachmentStore.of({ insert, select, url, keep, delete: remove })
  }),
)
