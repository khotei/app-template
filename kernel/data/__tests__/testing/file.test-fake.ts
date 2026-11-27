import {
  Array as Arr,
  Context,
  Effect,
  HashMap,
  Layer,
  Option,
  pipe,
  Ref,
  Stream,
  Struct,
} from 'effect'

import {
  type DownloadedFileEntity,
  type FileEntityWhere,
  FileObject,
} from '#kernel/data/file/file.entity'
import { FileRepository } from '#kernel/data/file/file.repository'

/** The files `FileRepositoryTest` holds, by id, for a test to read. */
export class FileObjects extends Context.Service<
  FileObjects,
  Ref.Ref<HashMap.HashMap<string, DownloadedFileEntity>>
>()('@app-template/kernel/data/testing/FileObjects') {
  static readonly layer = Layer.effect(
    this,
    Ref.make(HashMap.empty<string, DownloadedFileEntity>()),
  )
}

const withoutBlob = (file: DownloadedFileEntity) => Struct.omit(file, ['blob'])

/**
 * The files over a map, each signed once as `memory:<key>`. Copies what the repository's e2e
 * proves of the store: a missing id reads as none and is left out of a read of many, and a
 * delete skips it.
 */
export const FileRepositoryTest = Layer.effect(
  FileRepository,
  Effect.gen(function* () {
    const objects = yield* FileObjects

    const downloadMany = ({ id }: FileEntityWhere) =>
      Ref.get(objects).pipe(
        Effect.map((all) =>
          pipe(
            Arr.ensure(id),
            Arr.map((one) => HashMap.get(all, one)),
            Arr.getSomes,
          ),
        ),
      )
    const download = (where: FileEntityWhere) => downloadMany(where).pipe(Effect.map(Arr.head))
    return FileRepository.of({
      insert: (insert) =>
        Effect.gen(function* () {
          const blob = yield* Stream.mkUint8Array(insert.content)
          const url = new URL(`memory:${FileObject.buildKey(insert.id)}`)
          const file: DownloadedFileEntity = {
            ...Struct.pick(insert, ['id', 'mediaType', 'fileName']),
            url,
            blob,
          }
          yield* Ref.update(objects, HashMap.set(file.id, file))
          return blob.length
        }),
      selectOne: (where) => download(where).pipe(Effect.map(Option.map(withoutBlob))),
      selectMany: (where) => downloadMany(where).pipe(Effect.map(Arr.map(withoutBlob))),
      download,
      delete: ({ id }) => Ref.update(objects, HashMap.removeMany(Arr.ensure(id))),
    })
  }),
)
