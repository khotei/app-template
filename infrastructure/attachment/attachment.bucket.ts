import { Duration, Effect, Layer, type Stream } from 'effect'

import { unboundTag } from '@app-template/aws'
import {
  AttachmentBucket,
  type AttachmentId,
  type AttachmentMeta,
  FileSize,
} from '@app-template/domain/attachment'
import { S3Bucket } from '@app-template/s3'

const urlLifetime = Duration.minutes(5)
const unboundTags = { [unboundTag.key]: unboundTag.value }

export const buildObjectKey = (id: AttachmentId): string => `attachments/${id}`

export const AttachmentBucketS3 = Layer.effect(
  AttachmentBucket,
  Effect.map(S3Bucket, (files) => {
    const insert = Effect.fn('AttachmentBucket.insert')(
      <E>(id: AttachmentId, content: Stream.Stream<Uint8Array, E>, meta: AttachmentMeta) =>
        files
          .put(buildObjectKey(id), content, {
            contentType: meta.mediaType,
            fileName: meta.fileName,
            tags: unboundTags,
          })
          .pipe(Effect.map(FileSize.make)),
    )

    const select = Effect.fn('AttachmentBucket.select')((id: AttachmentId) =>
      files.get(buildObjectKey(id)),
    )

    const url = Effect.fn('AttachmentBucket.url')((id: AttachmentId) =>
      files.url(buildObjectKey(id), urlLifetime),
    )

    const keep = Effect.fn('AttachmentBucket.keep')((id: AttachmentId) =>
      files.untag(buildObjectKey(id)),
    )

    const remove = Effect.fn('AttachmentBucket.delete')((id: AttachmentId) =>
      files.delete(buildObjectKey(id)),
    )

    return AttachmentBucket.of({ insert, select, url, keep, delete: remove })
  }),
)
