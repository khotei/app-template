import { Array as Arr, Context, Duration, Effect, Layer, Option, pipe } from 'effect'

import { type ObjectHead, S3Bucket } from '@app-template/packages/s3'

import {
  buildFileKey,
  type DownloadedFileEntity,
  type FileEntity,
  type FileEntityInsert,
  type FileEntitySet,
  type FileEntityWhere,
  unboundTag,
} from '#kernel/data/file/file.entity'

const urlLifetime = Duration.minutes(5)
const unboundTags = { [unboundTag.key]: unboundTag.value }

/** `insert` always writes the name, so an object without one is a defect. */
const buildFileEntity =
  (id: string, url: URL) =>
  ({ contentType, fileName }: ObjectHead): Effect.Effect<FileEntity> =>
    Option.match(fileName, {
      onNone: () => Effect.die(new Error(`file ${id} has no name`)),
      onSome: (name) => Effect.succeed({ id, mediaType: contentType, fileName: name, url }),
    })

/** The answers of `read` for each id of `where`, concurrently, a missing one left out. */
const readEach =
  <A>(read: (id: string) => Effect.Effect<Option.Option<A>>) =>
  ({ id }: FileEntityWhere) =>
    pipe(
      id,
      Arr.ensure,
      Effect.forEach(read, { concurrency: 'unbounded' }),
      Effect.map(Arr.getSomes),
    )

/**
 * An object store joins no transaction: keep the bytes before the row that binds them, delete
 * them after the rows. Every write is idempotent, and none dies on a missing file. A read and an
 * `update` send one request per id, concurrently, since the store tags no batch; a read answers
 * in the order asked.
 */
export class FileRepository extends Context.Service<
  FileRepository,
  {
    /** Writes the bytes unbound and answers their count; fails with the stream's error and leaves nothing behind. */
    readonly insert: <E>(file: FileEntityInsert<E>) => Effect.Effect<number, E>
    /** A `HeadObject`, no bytes read. */
    readonly selectOne: (where: FileEntityWhere) => Effect.Effect<Option.Option<FileEntity>>
    readonly selectMany: (where: FileEntityWhere) => Effect.Effect<ReadonlyArray<FileEntity>>
    /** A `GetObject`, the metadata with the bytes. */
    readonly download: (
      where: FileEntityWhere,
    ) => Effect.Effect<Option.Option<DownloadedFileEntity>>
    readonly update: (set: FileEntitySet, where: FileEntityWhere) => Effect.Effect<void>
    /** In as few requests as the store allows. */
    readonly delete: (where: FileEntityWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/file/FileRepository', {
  make: S3Bucket.useSync((bucket) => {
    // Signing sends no request, so a missing file costs only its read.
    const signUrl = (id: string) => bucket.url(buildFileKey(id), urlLifetime)

    const headFile = Effect.fnUntraced(function* (id: string) {
      const head = yield* bucket.head(buildFileKey(id))
      const url = yield* signUrl(id)
      return yield* head.pipe(Option.map(buildFileEntity(id, url)), Effect.transposeOption)
    })

    const downloadFile = Effect.fnUntraced(function* (id: string) {
      const object = yield* bucket.download(buildFileKey(id))
      const url = yield* signUrl(id)
      return yield* object.pipe(
        Option.map(({ head, blob }) =>
          buildFileEntity(id, url)(head).pipe(Effect.map((file) => ({ ...file, blob }))),
        ),
        Effect.transposeOption,
      )
    })

    const untagFile = (id: string) => bucket.untag(buildFileKey(id))

    const selectMany = readEach(headFile)

    return {
      insert: Effect.fn('FileRepository.insert')(
        <E>({ id, content, mediaType, fileName }: FileEntityInsert<E>) =>
          bucket.put(buildFileKey(id), content, {
            contentType: mediaType,
            fileName,
            tags: unboundTags,
          }),
      ),
      selectOne: Effect.fn('FileRepository.selectOne')((where: FileEntityWhere) =>
        selectMany(where).pipe(Effect.map(Arr.head)),
      ),
      selectMany: Effect.fn('FileRepository.selectMany')(selectMany),
      download: Effect.fn('FileRepository.download')((where: FileEntityWhere) =>
        readEach(downloadFile)(where).pipe(Effect.map(Arr.head)),
      ),
      update: Effect.fn('FileRepository.update')((_bound: FileEntitySet, { id }: FileEntityWhere) =>
        pipe(
          id,
          Arr.ensure,
          Effect.forEach(untagFile, {
            concurrency: 'unbounded',
            discard: true,
          }),
        ),
      ),
      delete: Effect.fn('FileRepository.delete')(({ id }: FileEntityWhere) =>
        pipe(id, Arr.ensure, Arr.map(buildFileKey), bucket.deleteMany),
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
