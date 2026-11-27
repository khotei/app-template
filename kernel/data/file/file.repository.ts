import { Array as Arr, Context, Duration, Effect, Layer, Option, pipe } from 'effect'

import { type ObjectHead, S3Bucket } from '@app-template/packages/aws/s3'

import {
  type DownloadedFileEntity,
  type FileEntity,
  type FileEntityDownloadWhere,
  type FileEntityInsert,
  type FileEntityWhere,
  FileObject,
} from '#kernel/data/file/file.entity'

const urlLifetime = Duration.minutes(5)

/** `insert` always writes the name, so an object without one is a defect. */
const buildFileEntity = (
  { contentType, fileName }: ObjectHead,
  { id, url }: { readonly id: string; readonly url: URL },
): FileEntity => ({
  id,
  mediaType: contentType,
  fileName: Option.getOrThrowWith(fileName, () => new Error(`file ${id} has no name`)),
  url,
})

/** What `read` returns for each id of `where`, concurrently, a missing one left out. */
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
 * them after the rows. Every write is idempotent, and none dies on a missing file. A read sends
 * one request per id, concurrently, and returns in the order asked.
 */
export class FileRepository extends Context.Service<
  FileRepository,
  {
    /** Writes the bytes and returns their count; fails with the stream's error and leaves nothing behind. */
    readonly insert: <E>(file: FileEntityInsert<E>) => Effect.Effect<number, E>
    /** A `HeadObject`, no bytes read. */
    readonly selectOne: (where: FileEntityWhere) => Effect.Effect<Option.Option<FileEntity>>
    readonly selectMany: (where: FileEntityWhere) => Effect.Effect<ReadonlyArray<FileEntity>>
    /** A `GetObject`, the metadata with the bytes. */
    readonly download: (
      where: FileEntityDownloadWhere,
    ) => Effect.Effect<Option.Option<DownloadedFileEntity>>
    /** In as few requests as the store allows. */
    readonly delete: (where: FileEntityWhere) => Effect.Effect<void>
  }
>()('@app-template/kernel/data/file/FileRepository', {
  make: Effect.gen(function* () {
    const bucket = yield* S3Bucket

    // Signing sends no request, so a missing file costs only its read.
    const signUrl = (id: string) => bucket.url(FileObject.buildKey(id), urlLifetime)

    const headFile = Effect.fnUntraced(function* (id: string) {
      const head = yield* bucket.head(FileObject.buildKey(id))
      const url = yield* signUrl(id)
      return Option.map(head, (found) => buildFileEntity(found, { id, url }))
    })

    const downloadFile = Effect.fnUntraced(function* (id: string) {
      const object = yield* bucket.download(FileObject.buildKey(id))
      const url = yield* signUrl(id)
      return Option.map(object, ({ head, blob }) => ({
        ...buildFileEntity(head, { id, url }),
        blob,
      }))
    })

    const selectMany = readEach(headFile)

    return {
      insert: Effect.fn('FileRepository.insert')(
        <E>({ id, content, mediaType, fileName }: FileEntityInsert<E>) =>
          bucket.put(FileObject.buildKey(id), content, { contentType: mediaType, fileName }),
      ),
      selectOne: Effect.fn('FileRepository.selectOne')(selectMany, Effect.map(Arr.head)),
      selectMany: Effect.fn('FileRepository.selectMany')(selectMany),
      download: Effect.fn('FileRepository.download')(({ id }: FileEntityDownloadWhere) =>
        downloadFile(id),
      ),
      delete: Effect.fn('FileRepository.delete')(({ id }: FileEntityWhere) =>
        pipe(id, Arr.ensure, Arr.map(FileObject.buildKey), bucket.deleteMany),
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
