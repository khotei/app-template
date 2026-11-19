import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Option, Stream, Struct } from 'effect'

import {
  type AttachmentEntity,
  type AttachmentEntitySelectWhere,
  type AttachmentEntityWhere,
  FileRepository,
} from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { assertSchemaEquals, png } from '@app-template/packages/testing'

import { AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import { Attachment, FileName, FileSize, MediaType } from '#chat/domain/attachment.model'
import { AttachmentService } from '#chat/services/attachment.service'
import { chatId, messageId, owner } from '#testing/chat/chat.test-fixture'
import { type ChatRepositoryMocks, layerChatTest } from '#testing/chat/chat.test-layer'

const attachmentServiceOver = (attachments: ChatRepositoryMocks['attachments']) =>
  layerChatTest({ attachments })

/** An unbound attachment of `owner` in the library. */
const photo = new Attachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
  userId: owner,
  fileName: FileName.make('photo.png'),
  mediaType: MediaType.make('image/png'),
  size: FileSize.make(png.length),
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.000Z'),
})

/** The chat's copy of `photo`, sent from the library with the message `messageId`. */
const copy = new Attachment({
  ...photo,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000025'),
  messageId: Option.some(messageId),
  chatId: Option.some(chatId),
  sourceId: Option.some(photo.id),
})

const rowOf = encodeRowWith(Attachment)

const unknownAttachmentId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

describe('AttachmentService', () => {
  it.effect('getOne reads the attachment by the where it was given', () => {
    const wheres: Array<AttachmentEntitySelectWhere> = []
    return Effect.gen(function* () {
      const service = yield* AttachmentService

      const found = yield* service.getOne({ id: photo.id, userId: owner })

      assertEquals(found, photo)
      assert.deepStrictEqual(wheres, [{ id: photo.id, userId: owner }])
    }).pipe(
      Effect.provide(
        attachmentServiceOver({
          selectOne: (where) =>
            Effect.sync(() => {
              wheres.push(where)
            }).pipe(Effect.andThen(rowOf(photo)), Effect.map(Option.some)),
        }),
      ),
    )
  })

  it.effect('getOne of an id the store finds none of is AttachmentNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService

      const error = yield* service
        .getOne({ id: unknownAttachmentId, userId: owner })
        .pipe(Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [unknownAttachmentId] }),
      )
    }).pipe(Effect.provide(attachmentServiceOver({ selectOne: () => Effect.succeedNone }))),
  )

  it.effect('getMany reads the ids for the user and answers the rows the store found', () => {
    const wheres: Array<AttachmentEntitySelectWhere> = []
    return Effect.gen(function* () {
      const service = yield* AttachmentService
      const where = { id: [photo.id, unknownAttachmentId], userId: owner }

      const found = yield* service.getMany(where)

      assertEquals(found, [photo])
      assert.deepStrictEqual(wheres, [where])
    }).pipe(
      Effect.provide(
        attachmentServiceOver({
          selectMany: (where) =>
            Effect.sync(() => {
              wheres.push(where)
            }).pipe(
              Effect.andThen(rowOf(photo)),
              Effect.map((row) => [row]),
            ),
        }),
      ),
    )
  })

  it.effect('getMany of no ids answers none, reading nothing', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService

      assert.deepStrictEqual(yield* service.getMany({ id: [], userId: owner }), [])
    }).pipe(Effect.provide(attachmentServiceOver({}))),
  )

  it.effect("list reads the user's attachments of no chat", () => {
    const wheres: Array<AttachmentEntitySelectWhere> = []
    return Effect.gen(function* () {
      const service = yield* AttachmentService

      assertEquals(yield* service.list(owner), [photo])
      assert.deepStrictEqual(wheres, [{ userId: owner, chatId: null }])
    }).pipe(
      Effect.provide(
        attachmentServiceOver({
          selectMany: (where) =>
            Effect.sync(() => {
              wheres.push(where)
            }).pipe(
              Effect.andThen(rowOf(photo)),
              Effect.map((row) => [row]),
            ),
        }),
      ),
    )
  })

  it.effect("bind inserts the chat's copy of a library attachment and binds no row", () => {
    const inserts: Array<AttachmentEntity> = []
    return Effect.gen(function* () {
      const service = yield* AttachmentService

      const added = yield* service.bind([photo], { id: messageId, chatId }).pipe(Effect.head)

      assertEquals(added, new Attachment({ ...copy, id: added.id }))
      assert.deepStrictEqual(inserts, [yield* rowOf(added)])
    }).pipe(
      Effect.provide(
        attachmentServiceOver({
          insert: (row) =>
            Effect.sync(() => {
              inserts.push(row)
            }),
        }),
      ),
    )
  })

  it.effect("bind of a chat's attachment writes only where no message holds it yet", () => {
    const updates: Array<AttachmentEntityWhere> = []
    const held = new Attachment({ ...photo, chatId: Option.some(chatId) })
    return Effect.gen(function* () {
      const service = yield* AttachmentService

      yield* service.bind([held], { id: messageId, chatId })

      assert.deepStrictEqual(updates, [{ id: [held.id], messageId: null }])
    }).pipe(
      Effect.provide(
        attachmentServiceOver({
          update: (_, where) =>
            Effect.sync(() => {
              updates.push(where)
            }),
        }),
      ),
    )
  })

  it.effect('delete removes the rows by the where it was given and leaves their bytes', () => {
    const deleted: Array<AttachmentEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* AttachmentService
      const where = { id: Arr.make(photo.id, unknownAttachmentId), userId: owner, messageId: null }
      yield* FileRepository.use((files) => files.insert({ ...photo, content: Stream.make(png) }))

      yield* service.delete(where)

      assert.deepStrictEqual(deleted, [where])
      assert.deepStrictEqual(
        yield* FileRepository.use((files) => files.download({ id: photo.id })).pipe(
          Effect.map(Option.map(Struct.get('blob'))),
        ),
        Option.some(png),
      )
    }).pipe(
      Effect.provide(
        attachmentServiceOver({
          delete: (where) =>
            Effect.sync(() => {
              deleted.push(where)
            }),
        }),
      ),
    )
  })
})
