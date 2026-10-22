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
import { Base64 } from 'effect/encoding'
import { KeyValueStore } from 'effect/persistence'

import { buildResourceName, resources, unboundTag } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
import {
  type AttachmentId,
  type AttachmentMeta,
  AttachmentStore,
  type FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'

import { createBlobs, createCollection } from '#infrastructure/kv/kv-collection'

const bytesKey = (id: AttachmentId) => `${id}/bytes`
const mediaTypeKey = (id: AttachmentId) => `${id}/media-type`

const toDataUrl = ({ bytes, mediaType }: { bytes: Uint8Array; mediaType: MediaType }) =>
  new URL(`data:${mediaType};base64,${Base64.encode(bytes)}`)

export const AttachmentStoreKv = Layer.effect(
  AttachmentStore,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const blobs = createBlobs(store, { prefix: 'attachments/' })
    const mediaTypes = createCollection(store, { prefix: 'attachments/', schema: MediaType })

    const insert = Effect.fn('AttachmentStore.insert')(function* <E>(
      id: AttachmentId,
      content: Stream.Stream<Uint8Array, E>,
      meta: AttachmentMeta,
    ) {
      const bytes = yield* Stream.mkUint8Array(content)

      yield* mediaTypes.set(mediaTypeKey(id), meta.mediaType)
      yield* blobs.set(bytesKey(id), bytes)
      return FileSize.make(bytes.length)
    })

    const url = Effect.fn('AttachmentStore.url')(function* (id: AttachmentId) {
      const bytes = yield* blobs.get(bytesKey(id))
      const mediaType = yield* mediaTypes.get(mediaTypeKey(id))

      return Option.map(Option.all({ bytes, mediaType }), toDataUrl)
    })

    const remove = Effect.fn('AttachmentStore.delete')(function* (id: AttachmentId) {
      yield* blobs.delete(bytesKey(id))
      yield* mediaTypes.delete(mediaTypeKey(id))
    })

    return AttachmentStore.of({
      insert,
      select: Effect.fn('AttachmentStore.select')((id: AttachmentId) => blobs.get(bytesKey(id))),
      url,
      keep: Effect.fn('AttachmentStore.keep')((_id: AttachmentId) => Effect.void),
      delete: remove,
    })
  }),
)

/** The S3 minimum for every part but the last. */
const partSize = 5 * 1024 * 1024
const urlLifetime = Duration.minutes(5)
const unboundTagging = `${unboundTag.key}=${unboundTag.value}`

export const buildObjectKey = (id: AttachmentId): string => `attachments/${id}`

interface Held {
  readonly chunks: ReadonlyArray<Uint8Array>
  readonly size: number
}

interface UploadState {
  readonly id: AttachmentId
  readonly meta: AttachmentMeta
  readonly size: number
  readonly held: Held
  readonly upload: Option.Option<{ readonly UploadId?: string | undefined }>
  readonly parts: ReadonlyArray<{ readonly PartNumber: number; readonly ETag: string | undefined }>
}

const buildUploadState = (id: AttachmentId, meta: AttachmentMeta): UploadState => ({
  id,
  meta,
  size: 0,
  held: { chunks: [], size: 0 },
  upload: Option.none(),
  parts: [],
})

const buildBytes = ({ chunks, size }: Held) => {
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

  const bytes = buildBytes(held)
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

const buildObjectHeaders = (meta: AttachmentMeta) => ({
  ContentType: meta.mediaType,
  ContentDisposition: buildInlineDisposition(meta.fileName),
  Tagging: unboundTagging,
})

/** Typed as a bare `S3ServiceError`, a missing key still arrives tagged `NoSuchKey`. */
const isNoSuchKey = (error: unknown): boolean => Predicate.isTagged(error, 'NoSuchKey')

export const AttachmentStoreS3 = Layer.effect(
  AttachmentStore,
  Effect.gen(function* () {
    const s3 = yield* S3Service
    const { stage } = yield* AwsConfig
    const bucket = buildResourceName(stage, resources.buckets.attachments.name)

    const buildObjectRef = (id: AttachmentId) => ({ Bucket: bucket, Key: buildObjectKey(id) })

    const startUpload = (state: UploadState) =>
      Effect.acquireRelease(
        s3.createMultipartUpload({
          ...buildObjectRef(state.id),
          ...buildObjectHeaders(state.meta),
        }),
        ({ UploadId }, exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : s3.abortMultipartUpload({ ...buildObjectRef(state.id), UploadId }).pipe(Effect.orDie),
      )

    const sendPart = Effect.fnUntraced(function* (state: UploadState, bytes: Uint8Array) {
      const upload = yield* Option.match(state.upload, {
        onNone: () => startUpload(state),
        onSome: Effect.succeed,
      })
      const PartNumber = state.parts.length + 1

      const { ETag } = yield* s3.uploadPart({
        ...buildObjectRef(state.id),
        UploadId: upload.UploadId,
        PartNumber,
        Body: bytes,
      })
      return {
        ...state,
        upload: Option.some(upload),
        parts: Arr.append(state.parts, { PartNumber, ETag }),
      }
    })

    const receive = Effect.fnUntraced(function* (state: UploadState, chunk: Uint8Array) {
      const [full, held] = splitFullParts({
        chunks: Arr.append(state.held.chunks, chunk),
        size: state.held.size + chunk.length,
      })

      const sent = yield* Effect.reduce(full, () => state, sendPart)
      return { ...sent, held, size: state.size + chunk.length }
    }, Effect.orDie)

    /** Not `Stream.mapAccum`'s `onHalt`: it runs on a failure too, storing a broken stream. */
    const finish = Effect.fnUntraced(function* (state: UploadState) {
      const last = buildBytes(state.held)

      if (Option.isNone(state.upload)) {
        yield* s3.putObject({
          ...buildObjectRef(state.id),
          ...buildObjectHeaders(state.meta),
          Body: last,
        })
        return state.size
      }

      const { UploadId } = state.upload.value
      const sent = yield* sendPart(state, last)
      yield* s3.completeMultipartUpload({
        ...buildObjectRef(state.id),
        UploadId,
        MultipartUpload: { Parts: [...sent.parts] },
      })
      return state.size
    }, Effect.orDie)

    const remove = Effect.fn('AttachmentStore.delete')((id: AttachmentId) =>
      s3.deleteObject(buildObjectRef(id)).pipe(Effect.asVoid, Effect.orDie),
    )

    const insert = Effect.fn('AttachmentStore.insert')(
      <E>(id: AttachmentId, content: Stream.Stream<Uint8Array, E>, meta: AttachmentMeta) =>
        Stream.runFoldEffect(content, () => buildUploadState(id, meta), receive).pipe(
          Effect.flatMap(finish),
          Effect.scoped,
          Effect.map(FileSize.make),
        ),
    )

    const select = Effect.fn('AttachmentStore.select')(function* (id: AttachmentId) {
      const found = yield* s3.getObject(buildObjectRef(id)).pipe(
        Effect.map(Option.some),
        Effect.catchTag('NoSuchKey', () => Effect.succeedNone),
        Effect.orDie,
      )
      const read = Option.map(found, ({ Body }) =>
        Effect.promise(async () => (await Body?.transformToByteArray()) ?? new Uint8Array()),
      )
      return yield* Effect.transposeOption(read)
    })

    // Presigning never checks that the object exists.
    const url = Effect.fn('AttachmentStore.url')(function* (id: AttachmentId) {
      const exists = yield* s3.headObject(buildObjectRef(id)).pipe(
        Effect.as(true),
        Effect.catchTag('NotFound', () => Effect.succeed(false)),
        Effect.orDie,
      )
      if (!exists) return Option.none()

      const now = yield* Clock.currentTimeMillis
      const signed = yield* s3
        .getObject(buildObjectRef(id), {
          presigned: true,
          expiresIn: Duration.toSeconds(urlLifetime),
          signingDate: new Date(now),
        })
        .pipe(Effect.orDie)
      return Option.some(new URL(signed))
    })

    const keep = Effect.fn('AttachmentStore.keep')((id: AttachmentId) =>
      s3.deleteObjectTagging(buildObjectRef(id)).pipe(
        Effect.catchIf(isNoSuchKey, () => Effect.void),
        Effect.asVoid,
        Effect.orDie,
      ),
    )

    return AttachmentStore.of({ insert, select, url, keep, delete: remove })
  }),
)
