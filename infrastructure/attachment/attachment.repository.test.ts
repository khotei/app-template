import { assert, describe, layer } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  AttachmentId,
  AttachmentRepository,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import { UserId } from '@app-template/domain/user'

import { AttachmentRepositoryKv } from '#infrastructure/attachment/attachment.repository'

const attachment = (id: string) =>
  buildAttachment({
    id: AttachmentId.make(id),
    userId: UserId.make('0192d4e0-7b3a-7c00-8000-000000000010'),
    fileName: FileName.make('photo.png'),
    mediaType: MediaType.make('image/png'),
    size: FileSize.make(1024),
    createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.000Z'),
  })

const unknownId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

describe('AttachmentRepositoryKv', () => {
  layer(AttachmentRepositoryKv.pipe(Layer.provide(KeyValueStore.layerMemory)))((it) => {
    it.effect('update never creates an attachment', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentRepository

        yield* attachments.update(attachment(unknownId))

        assert.deepStrictEqual(yield* attachments.selectById(unknownId), Option.none())
      }),
    )

    it.effect('deletes the attachments asked for and keeps the rest', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentRepository
        const kept = attachment('0192d4e0-7b3a-7c00-8000-000000000023')
        const dropped = [
          attachment('0192d4e0-7b3a-7c00-8000-000000000024'),
          attachment('0192d4e0-7b3a-7c00-8000-000000000025'),
        ]
        yield* Effect.forEach(Arr.prepend(dropped, kept), attachments.insert)

        const droppedIds = Arr.map(dropped, (each) => each.id)
        yield* attachments.deleteByIds(Arr.append(droppedIds, unknownId))

        const ids = Arr.prepend(droppedIds, kept.id)
        assert.deepStrictEqual(yield* attachments.selectByIds(ids), [kept])
      }),
    )
  })
})
