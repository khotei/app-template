import { Array as Arr, Context, Duration, Effect, Layer, type Option } from 'effect'

import { S3Bucket } from '@app-template/s3'

import {
  buildFileKey,
  type FileEntityDeleteWhere,
  type FileEntityInsert,
  type FileEntitySet,
  type FileEntityWhere,
  unboundTag,
} from '#kernel/data/file/file.entity'

const urlLifetime = Duration.minutes(5)
const unboundTags = { [unboundTag.key]: unboundTag.value }

/**
 * An object store joins no transaction: keep the bytes before the row that binds them, delete
 * them after the rows. Every write is idempotent, and none dies on a missing file.
 */
export class FileRepository extends Context.Service<
  FileRepository,
  {
    /** Writes the bytes unbound and answers their count; fails with the stream's error and leaves nothing behind. */
    readonly insert: <E>(file: FileEntityInsert<E>) => Effect.Effect<number, E>
    readonly selectOne: (where: FileEntityWhere) => Effect.Effect<Option.Option<Uint8Array>>
    /** A URL that serves the bytes with the stored media type and an inline disposition; none for a missing file. */
    readonly url: (where: FileEntityWhere) => Effect.Effect<Option.Option<URL>>
    readonly update: (set: FileEntitySet, where: FileEntityWhere) => Effect.Effect<void>
    /** In as few requests as the store allows. */
    readonly delete: (where: FileEntityDeleteWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/file/FileRepository', {
  make: S3Bucket.useSync((bucket) => ({
    insert: Effect.fn('FileRepository.insert')(
      <E>({ id, content, mediaType, fileName }: FileEntityInsert<E>) =>
        bucket.put(buildFileKey(id), content, {
          contentType: mediaType,
          fileName,
          tags: unboundTags,
        }),
    ),
    selectOne: Effect.fn('FileRepository.selectOne')(({ id }: FileEntityWhere) =>
      bucket.get(buildFileKey(id)),
    ),
    url: Effect.fn('FileRepository.url')(({ id }: FileEntityWhere) =>
      bucket.url(buildFileKey(id), urlLifetime),
    ),
    update: Effect.fn('FileRepository.update')((_set: FileEntitySet, { id }: FileEntityWhere) =>
      bucket.untag(buildFileKey(id)),
    ),
    delete: Effect.fn('FileRepository.delete')(({ id }: FileEntityDeleteWhere) =>
      bucket.deleteMany(Arr.map(id, buildFileKey)),
    ),
  })),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
