import type { S3Service } from '@effect-aws/client-s3'
import { Array as Arr, Duration, Effect, Layer, type Stream } from 'effect'

import { buildResourceName, resources, unboundTag } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
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

/** `S3Bucket` on the attachments bucket of the stage in `AwsConfig`, over the `S3Service` in context. */
export const S3BucketFromConfig: Layer.Layer<S3Bucket, never, S3Service | AwsConfig> = Layer.unwrap(
  AwsConfig.useSync(({ stage }) =>
    S3Bucket.layer({ bucket: buildResourceName(stage, resources.buckets.attachments.name) }),
  ),
)

export const AttachmentBucketS3 = Layer.effect(
  AttachmentBucket,
  S3Bucket.useSync((bucket) => {
    const insert = Effect.fn('AttachmentBucket.insert')(
      <E>(id: AttachmentId, content: Stream.Stream<Uint8Array, E>, meta: AttachmentMeta) =>
        bucket
          .put(buildObjectKey(id), content, {
            contentType: meta.mediaType,
            fileName: meta.fileName,
            tags: unboundTags,
          })
          .pipe(Effect.map(FileSize.make)),
    )

    const select = Effect.fn('AttachmentBucket.select')((id: AttachmentId) =>
      bucket.get(buildObjectKey(id)),
    )

    const url = Effect.fn('AttachmentBucket.url')((id: AttachmentId) =>
      bucket.url(buildObjectKey(id), urlLifetime),
    )

    const keep = Effect.fn('AttachmentBucket.keep')((id: AttachmentId) =>
      bucket.untag(buildObjectKey(id)),
    )

    const remove = Effect.fn('AttachmentBucket.delete')((ids: ReadonlyArray<AttachmentId>) =>
      bucket.deleteMany(Arr.map(ids, buildObjectKey)),
    )

    return AttachmentBucket.of({ insert, select, url, keep, delete: remove })
  }),
)
