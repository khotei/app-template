import { Array as Arr, Context, Duration, Effect, Layer, Option } from 'effect'

import { type ObjectHead, S3Bucket } from '@app-template/packages/s3'

import {
  buildFileKey,
  type DownloadedFileEntity,
  type FileEntity,
  type FileEntityInsert,
  type FileEntityManyWhere,
  type FileEntitySet,
  type FileEntityWhere,
  unboundTag,
} from '#kernel/data/file/file.entity'

const urlLifetime = Duration.minutes(5)
const unboundTags = { [unboundTag.key]: unboundTag.value }

/** `insert` always writes the name, so an object without one is a defect. */
const buildFileEntity =
  (id: string, url: URL) =>
  ({ contentType, fileName }: ObjectHead): FileEntity => ({
    id,
    mediaType: contentType,
    fileName: Option.getOrThrowWith(fileName, () => new Error(`file ${id} has no name`)),
    url,
  })

/**
 * An object store joins no transaction: keep the bytes before the row that binds them, delete
 * them after the rows. Every write is idempotent, and none dies on a missing file.
 */
export class FileRepository extends Context.Service<
  FileRepository,
  {
    /** Writes the bytes unbound and answers their count; fails with the stream's error and leaves nothing behind. */
    readonly insert: <E>(file: FileEntityInsert<E>) => Effect.Effect<number, E>
    /** One `HeadObject` per file, no bytes read. */
    readonly selectOne: (where: FileEntityWhere) => Effect.Effect<Option.Option<FileEntity>>
    /** The files found, in the order asked. */
    readonly selectMany: (where: FileEntityManyWhere) => Effect.Effect<ReadonlyArray<FileEntity>>
    readonly download: (
      where: FileEntityWhere,
    ) => Effect.Effect<Option.Option<DownloadedFileEntity>>
    readonly update: (set: FileEntitySet, where: FileEntityWhere) => Effect.Effect<void>
    /** In as few requests as the store allows. */
    readonly delete: (where: FileEntityManyWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/file/FileRepository', {
  make: S3Bucket.useSync((bucket) => {
    // Signing sends no request, so a missing file costs only its `HeadObject`.
    const selectOne = Effect.fn('FileRepository.selectOne')(function* ({ id }: FileEntityWhere) {
      const head = yield* bucket.head(buildFileKey(id))
      const url = yield* bucket.url(buildFileKey(id), urlLifetime)
      return Option.map(head, buildFileEntity(id, url))
    })

    return {
      insert: Effect.fn('FileRepository.insert')(
        <E>({ id, content, mediaType, fileName }: FileEntityInsert<E>) =>
          bucket.put(buildFileKey(id), content, {
            contentType: mediaType,
            fileName,
            tags: unboundTags,
          }),
      ),
      selectOne,
      selectMany: Effect.fn('FileRepository.selectMany')(({ id }: FileEntityManyWhere) =>
        Effect.forEach(id, (one) => selectOne({ id: one }), { concurrency: 'unbounded' }).pipe(
          Effect.map(Arr.getSomes),
        ),
      ),
      download: Effect.fn('FileRepository.download')((where: FileEntityWhere) =>
        Effect.all({ file: selectOne(where), blob: bucket.download(buildFileKey(where.id)) }).pipe(
          Effect.map(Option.all),
          Effect.map(Option.map(({ file, blob }) => ({ ...file, blob }))),
        ),
      ),
      update: Effect.fn('FileRepository.update')((_set: FileEntitySet, { id }: FileEntityWhere) =>
        bucket.untag(buildFileKey(id)),
      ),
      delete: Effect.fn('FileRepository.delete')(({ id }: FileEntityManyWhere) =>
        bucket.deleteMany(Arr.map(id, buildFileKey)),
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
