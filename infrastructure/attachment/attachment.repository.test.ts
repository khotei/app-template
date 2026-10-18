import { assert, describe, layer } from '@effect/vitest'
import { DateTime, Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  Attachment,
  AttachmentId,
  AttachmentRepository,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import { MessageId } from '@app-template/domain/chat'
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
    it.effect('selects by ids in the order asked, leaving unknown ids out', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentRepository
        const first = attachment('0192d4e0-7b3a-7c00-8000-000000000020')
        const second = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
        yield* attachments.insert(first)
        yield* attachments.insert(second)

        const selected = yield* attachments.selectByIds([second.id, unknownId, first.id])

        assert.deepStrictEqual(selected, [second, first])
      }),
    )

    it.effect('update binds an attachment to a message', () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentRepository
        const unbound = attachment('0192d4e0-7b3a-7c00-8000-000000000022')
        const bound = new Attachment({
          ...unbound,
          messageId: Option.some(MessageId.make('0192d4e0-7b3a-7c00-8000-000000000030')),
        })
        yield* attachments.insert(unbound)

        yield* attachments.update(bound)

        assert.deepStrictEqual(yield* attachments.selectById(unbound.id), Option.some(bound))
      }),
    )

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
        yield* Effect.forEach([kept, ...dropped], (each) => attachments.insert(each))

        yield* attachments.deleteByIds([...dropped.map((each) => each.id), unknownId])

        const ids = [kept.id, ...dropped.map((each) => each.id)]
        assert.deepStrictEqual(yield* attachments.selectByIds(ids), [kept])
      }),
    )
  })
})
