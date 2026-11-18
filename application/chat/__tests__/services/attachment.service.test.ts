import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import {
  type AttachmentEntitySelectWhere,
  type AttachmentEntityWhere,
  AttachmentRepository,
  type FileEntityWhere,
  FileRepository,
} from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { assertSchemaEquals, epoch, png } from '@app-template/packages/testing'

import { AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  Attachment,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '#chat/domain/attachment.model'
import { AttachmentService } from '#chat/services/attachment.service'
import { owner } from '#testing/chat/chat.test-fixture'

/** The service over repositories that answer only the methods the case gives; any other dies. */
const attachmentServiceOver = ({
  attachments = {},
  files = {},
}: {
  readonly attachments?: Layer.PartialEffectful<AttachmentRepository['Service']>
  readonly files?: Layer.PartialEffectful<FileRepository['Service']>
}) =>
  AttachmentService.layer.pipe(
    Layer.provide([
      Layer.mock(AttachmentRepository, attachments),
      Layer.mock(FileRepository, files),
      BunCrypto.layer,
    ]),
  )

const photo = buildAttachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
  userId: owner,
  fileName: FileName.make('photo.png'),
  mediaType: MediaType.make('image/png'),
  size: FileSize.make(png.length),
  createdAt: epoch,
})

const photoRow = encodeRowWith(Attachment)(photo)

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
          attachments: {
            selectOne: (where) =>
              Effect.sync(() => {
                wheres.push(where)
              }).pipe(Effect.andThen(photoRow), Effect.map(Option.some)),
          },
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
    }).pipe(
      Effect.provide(
        attachmentServiceOver({ attachments: { selectOne: () => Effect.succeedNone } }),
      ),
    ),
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
          attachments: {
            selectMany: (where) =>
              Effect.sync(() => {
                wheres.push(where)
              }).pipe(
                Effect.andThen(photoRow),
                Effect.map((row) => [row]),
              ),
          },
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
          attachments: {
            selectMany: (where) =>
              Effect.sync(() => {
                wheres.push(where)
              }).pipe(
                Effect.andThen(photoRow),
                Effect.map((row) => [row]),
              ),
          },
        }),
      ),
    )
  })

  it.effect('delete removes the rows by the where it was given, then their bytes', () => {
    const calls: Array<
      readonly ['attachments', AttachmentEntityWhere] | readonly ['files', FileEntityWhere]
    > = []
    return Effect.gen(function* () {
      const service = yield* AttachmentService
      const where = { id: [photo.id, unknownAttachmentId], userId: owner }

      yield* service.delete(where)

      assert.deepStrictEqual(calls, [
        ['attachments', where],
        ['files', { id: where.id }],
      ])
    }).pipe(
      Effect.provide(
        attachmentServiceOver({
          attachments: {
            delete: (where) =>
              Effect.sync(() => {
                calls.push(['attachments', where])
              }),
          },
          files: {
            delete: (where) =>
              Effect.sync(() => {
                calls.push(['files', where])
              }),
          },
        }),
      ),
    )
  })
})
