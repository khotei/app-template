import { Context, Effect, HashMap, Layer, Option, Ref, Stream } from 'effect'

import { buildFileKey, type FileEntityWhere } from '#kernel/data/file/file.entity'
import { FileRepository } from '#kernel/data/file/file.repository'

/** The bytes `FileRepositoryTest` holds, by id, for a test to read. */
export class FileObjects extends Context.Service<
  FileObjects,
  Ref.Ref<HashMap.HashMap<string, Uint8Array>>
>()('@app-template/kernel/testing/FileObjects') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<string, Uint8Array>()))
}

/**
 * The files over a map. Copies what the repository's e2e proves of the store: a missing id reads
 * and signs as none, and a delete skips it. `update` keeps no tag, since nothing here expires.
 */
export const FileRepositoryTest = Layer.effect(
  FileRepository,
  FileObjects.useSync((objects) => {
    const selectOne = ({ id }: FileEntityWhere) =>
      Ref.get(objects).pipe(Effect.map(HashMap.get(id)))
    return FileRepository.of({
      insert: ({ id, content }) =>
        Effect.gen(function* () {
          const bytes = yield* Stream.mkUint8Array(content)
          yield* Ref.update(objects, HashMap.set<string, Uint8Array>(id, bytes))
          return bytes.length
        }),
      selectOne,
      url: (where) =>
        selectOne(where).pipe(Effect.map(Option.as(new URL(`memory:${buildFileKey(where.id)}`)))),
      update: () => Effect.void,
      delete: ({ id }) => Ref.update(objects, HashMap.removeMany(id)),
    })
  }),
)
