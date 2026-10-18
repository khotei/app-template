import { assert, describe, layer } from '@effect/vitest'
import { Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { AttachmentId, AttachmentStore } from '@app-template/domain/attachment'

import { AttachmentStoreKv } from '#infrastructure/attachment/attachment.storage'

const id = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000020')
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])

describe('AttachmentStoreKv', () => {
  layer(AttachmentStoreKv.pipe(Layer.provide(KeyValueStore.layerMemory)))((it) => {
    it.effect('returns the inserted bytes, then none once they are deleted', () =>
      Effect.gen(function* () {
        const store = yield* AttachmentStore

        yield* store.insert(id, png)

        assert.deepStrictEqual(yield* store.select(id), Option.some(png))

        yield* store.delete(id)

        assert.deepStrictEqual(yield* store.select(id), Option.none())
      }),
    )

    it.effect('selects none for bytes never stored', () =>
      Effect.gen(function* () {
        const store = yield* AttachmentStore

        const unknown = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

        assert.deepStrictEqual(yield* store.select(unknown), Option.none())
      }),
    )
  })
})
