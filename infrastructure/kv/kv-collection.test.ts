import { BunServices } from '@effect/platform-bun'
import { assert, describe, layer } from '@effect/vitest'
import {
  Cause,
  ConfigProvider,
  DateTime,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Schema,
} from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { createBlobs, createCollection, createIndex } from '#infrastructure/kv/kv-collection'
import { KeyValueStoreFileSystem } from '#infrastructure/kv/kv-store'

const fileSystemStore = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped()
    return KeyValueStoreFileSystem.pipe(
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ STORE_PATH: directory }))),
    )
  }),
).pipe(Layer.provide(BunServices.layer))

const Note = Schema.Struct({ title: Schema.String, pinnedAt: Schema.Option(Schema.DateTimeUtc) })

const notes = Effect.map(KeyValueStore.KeyValueStore, (store) =>
  createCollection(store, { prefix: 'notes/', schema: Note }),
)

const chats = Effect.map(KeyValueStore.KeyValueStore, (store) =>
  createIndex(store, { prefix: 'users/', id: Schema.String }),
)

const files = Effect.map(KeyValueStore.KeyValueStore, (store) =>
  createBlobs(store, { prefix: 'files/' }),
)

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])

describe.each([
  { name: 'memory', store: KeyValueStore.layerMemory },
  { name: 'file system', store: fileSystemStore },
])('kv-collection on the $name store', ({ store }) => {
  layer(store)((it) => {
    it.effect('round-trips a value under a key with a slash, then deletes it', () =>
      Effect.gen(function* () {
        const collection = yield* notes
        const note = { title: 'Trip', pinnedAt: Option.some(DateTime.makeUnsafe(0)) }

        yield* collection.set('users/1', note)

        assert.deepStrictEqual(yield* collection.get('users/1'), Option.some(note))
        assert.deepStrictEqual(yield* collection.get('users'), Option.none())

        yield* collection.delete('users/1')

        assert.deepStrictEqual(yield* collection.get('users/1'), Option.none())
      }),
    )

    it.effect('modify creates a missing key, then updates it', () =>
      Effect.gen(function* () {
        const collection = yield* notes
        const retitle = Option.match({
          onNone: () => ({ title: 'Draft', pinnedAt: Option.none() }),
          onSome: (note: typeof Note.Type) => ({ ...note, title: `${note.title}!` }),
        })

        yield* collection.modify('2', retitle)
        const updated = yield* collection.modify('2', retitle)

        assert.strictEqual(updated.title, 'Draft!')
        assert.deepStrictEqual(yield* collection.get('2'), Option.some(updated))
      }),
    )

    it.effect('update applies f to an existing key and writes nothing for a missing one', () =>
      Effect.gen(function* () {
        const collection = yield* notes
        const retitle = (note: typeof Note.Type) => ({ ...note, title: `${note.title}!` })
        yield* collection.set('4', { title: 'Trip', pinnedAt: Option.none() })

        const updated = yield* collection.update('4', retitle)
        const missing = yield* collection.update('5', retitle)

        const expected = { title: 'Trip!', pinnedAt: Option.none() }
        assert.deepStrictEqual(updated, Option.some(expected))
        assert.deepStrictEqual(yield* collection.get('4'), Option.some(expected))
        assert.deepStrictEqual(missing, Option.none())
        assert.deepStrictEqual(yield* collection.get('5'), Option.none())
      }),
    )

    it.effect('dies with a schema error on a stored value that no longer decodes', () =>
      Effect.gen(function* () {
        yield* (yield* KeyValueStore.KeyValueStore).set('notes/3', JSON.stringify({ title: 42 }))

        const exit = yield* Effect.exit((yield* notes).get('3'))

        assert.isTrue(Exit.hasDies(exit) && Schema.isSchemaError(Cause.squash(exit.cause)))
      }),
    )

    it.effect('round-trips bytes under a key with a slash, then deletes them', () =>
      Effect.gen(function* () {
        const blobs = yield* files

        yield* blobs.set('1/bytes', png)

        assert.deepStrictEqual(yield* blobs.get('1/bytes'), Option.some(png))
        assert.deepStrictEqual(yield* blobs.get('2/bytes'), Option.none())

        yield* blobs.delete('1/bytes')

        assert.deepStrictEqual(yield* blobs.get('1/bytes'), Option.none())
      }),
    )

    it.effect('appends and removes ids, listing them in insertion order', () =>
      Effect.gen(function* () {
        const index = yield* chats

        yield* index.append('1/chats', 'c')
        yield* index.append('1/chats', 'a')
        yield* index.append('1/chats', 'b')
        yield* index.remove('1/chats', 'a')

        assert.deepStrictEqual(yield* index.list('1/chats'), ['c', 'b'])
        assert.deepStrictEqual(yield* index.list('unknown/chats'), [])
      }),
    )

    it.effect('delete drops the whole index', () =>
      Effect.gen(function* () {
        const index = yield* chats
        yield* index.append('2/chats', 'a')

        yield* index.delete('2/chats')
        yield* index.append('2/chats', 'b')

        assert.deepStrictEqual(yield* index.list('2/chats'), ['b'])
      }),
    )

    it.effect('loses no id to concurrent appends on one index', () =>
      Effect.gen(function* () {
        const index = yield* chats
        const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

        yield* Effect.forEach(ids, (id) => index.append('3/chats', id), {
          concurrency: 'unbounded',
        })

        assert.sameMembers([...(yield* index.list('3/chats'))], ids)
      }),
    )
  })
})
