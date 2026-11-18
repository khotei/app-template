import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Exit, HashMap, Layer, Option, Ref, Stream, Struct } from 'effect'

import {
  type AttachmentEntity,
  type AttachmentEntityWhere,
  AttachmentRepository,
  FileRepository,
} from '@app-template/kernel/data'
import { FileObjects, FileRepositoryTest } from '@app-template/kernel/data/testing'
import { encodeRowWith } from '@app-template/packages/db'
import {
  assertSchemaEquals,
  breakAfter,
  epoch,
  isUuidV7,
  png,
  StreamBrokenError,
} from '@app-template/packages/testing'

import { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  Attachment,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '#chat/domain/attachment.model'
import { FileAttachmentService } from '#chat/services/file-attachment.service'
import { chatId, messageId, owner } from '#testing/chat/chat.test-fixture'

/**
 * The service over an `AttachmentRepository` that answers only the methods the case gives, and
 * the memory files, which stay in context for the case to read.
 */
const fileAttachmentServiceOver = (
  attachments: Layer.PartialEffectful<AttachmentRepository['Service']>,
) =>
  FileAttachmentService.layer.pipe(
    Layer.provide([Layer.mock(AttachmentRepository, attachments), BunCrypto.layer]),
    Layer.provideMerge(FileRepositoryTest),
    Layer.provideMerge(FileObjects.layer),
  )

const photo = { fileName: FileName.make('photo.png'), mediaType: MediaType.make('image/png') }

const photoUpload = { ...photo, content: Stream.make(png) }

/** An unbound attachment of `owner` in the library. */
const stored = buildAttachment({
  ...photo,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
  userId: owner,
  size: FileSize.make(png.length),
  createdAt: epoch,
})

/** `stored` held by the message `messageId`. */
const bound = new Attachment({
  ...stored,
  messageId: Option.some(messageId),
  chatId: Option.some(chatId),
})

/** The chat's record of `stored`, sent from the library with that message. */
const record = new Attachment({
  ...bound,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000025'),
  sourceId: Option.some(stored.id),
})

const rowOf = encodeRowWith(Attachment)

/** A read that answers `attachment` as its one row. */
const selectsOne = (attachment: Attachment) => () => rowOf(attachment).pipe(Effect.map(Option.some))

const selectsMany =
  (...found: ReadonlyArray<Attachment>) =>
  () =>
    Effect.forEach(found, (attachment) => rowOf(attachment))

/** Stores `stored`'s bytes, as an upload left them. */
const storeBytes = FileRepository.use((files) => files.insert({ ...photoUpload, id: stored.id }))

const countObjects = FileObjects.use(Ref.get).pipe(Effect.map(HashMap.size))

const downloadBytes = (id: AttachmentId) =>
  FileRepository.use((files) => files.download({ id })).pipe(
    Effect.map(Option.map(Struct.get('blob'))),
  )

const bucketHref = (id: AttachmentId) =>
  FileRepository.use((files) => files.selectOne({ id })).pipe(
    Effect.map(Option.map((file) => file.url.href)),
  )

const brokenUploads = [
  {
    name: "a later file's content breaking part-way",
    files: (broken: StreamBrokenError) =>
      Stream.make(photoUpload, { ...photo, content: breakAfter([png], broken) }),
  },
  {
    name: 'the files breaking after the first one',
    files: (broken: StreamBrokenError) => breakAfter([photoUpload], broken),
  },
] as const

describe('FileAttachmentService', () => {
  it.effect('upload stores the bytes, then the row of an unbound attachment', () => {
    const inserts: Array<AttachmentEntity> = []
    return Effect.gen(function* () {
      const service = yield* FileAttachmentService

      const attachment = yield* service.upload(owner, Stream.make(photoUpload)).pipe(Effect.head)

      assert.isTrue(isUuidV7(attachment.id))
      assertEquals(attachment, new Attachment({ ...stored, id: attachment.id }))
      assert.deepStrictEqual(inserts, [yield* rowOf(attachment)])
      assert.deepStrictEqual(yield* downloadBytes(attachment.id), Option.some(png))
    }).pipe(
      Effect.provide(
        fileAttachmentServiceOver({
          insert: (row) =>
            Effect.sync(() => {
              inserts.push(row)
            }),
        }),
      ),
    )
  })

  it.effect('upload stores each file of the stream, in order', () => {
    const inserts: Array<AttachmentEntity> = []
    return Effect.gen(function* () {
      const service = yield* FileAttachmentService
      const second = { ...photo, fileName: FileName.make('second.png') }

      const uploaded = yield* service.upload(
        owner,
        Stream.make(photoUpload, { ...second, content: Stream.make(png) }),
      )

      assert.deepStrictEqual(Arr.map(uploaded, Struct.get('fileName')), [
        photo.fileName,
        second.fileName,
      ])
      assert.deepStrictEqual(
        inserts,
        yield* Effect.forEach(uploaded, (attachment) => rowOf(attachment)),
      )
    }).pipe(
      Effect.provide(
        fileAttachmentServiceOver({
          insert: (row) =>
            Effect.sync(() => {
              inserts.push(row)
            }),
        }),
      ),
    )
  })

  it.effect.each(brokenUploads)(
    'upload with $name fails with its error, deleting the rows and bytes it stored',
    ({ files }) => {
      const inserted: Array<string> = []
      const deleted: Array<AttachmentEntityWhere> = []
      return Effect.gen(function* () {
        const service = yield* FileAttachmentService
        const broken = new StreamBrokenError()

        const error = yield* service.upload(owner, files(broken)).pipe(Effect.flip)

        assert.strictEqual(error, broken)
        assert.deepStrictEqual(deleted, [{ id: inserted }])
        assert.strictEqual(yield* countObjects, 0)
      }).pipe(
        Effect.provide(
          fileAttachmentServiceOver({
            insert: (row) =>
              Effect.sync(() => {
                inserted.push(row.id)
              }),
            delete: (where) =>
              Effect.sync(() => {
                deleted.push(where)
              }),
          }),
        ),
      )
    },
  )

  it.effect('upload whose row write dies leaves no bytes and deletes no row', () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService

      const exit = yield* service.upload(owner, Stream.make(photoUpload)).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assert.strictEqual(yield* countObjects, 0)
    }).pipe(
      Effect.provide(
        fileAttachmentServiceOver({ insert: () => Effect.die('the record write was lost') }),
      ),
    ),
  )

  it.effect("download returns the bucket's URL of the owner's attachment", () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService
      yield* storeBytes

      const url = yield* service.download({ id: stored.id, userId: owner })

      assert.deepStrictEqual(Option.some(url.href), yield* bucketHref(stored.id))
    }).pipe(Effect.provide(fileAttachmentServiceOver({ selectOne: selectsOne(stored) }))),
  )

  it.effect('download of an attachment whose bytes are gone is AttachmentNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService

      const error = yield* service.download({ id: stored.id, userId: owner }).pipe(Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [stored.id] }),
      )
    }).pipe(Effect.provide(fileAttachmentServiceOver({ selectOne: selectsOne(stored) }))),
  )

  it.effect("bind inserts the chat's record of a library attachment and binds no row", () => {
    const inserts: Array<AttachmentEntity> = []
    return Effect.gen(function* () {
      const service = yield* FileAttachmentService

      const added = yield* service.bind([stored], { id: messageId, chatId }).pipe(Effect.head)

      assertEquals(added, new Attachment({ ...record, id: added.id }))
      assert.deepStrictEqual(inserts, [yield* rowOf(added)])
    }).pipe(
      Effect.provide(
        fileAttachmentServiceOver({
          insert: (row) =>
            Effect.sync(() => {
              inserts.push(row)
            }),
        }),
      ),
    )
  })

  it.effect("a record is read and downloaded by its source's bytes", () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService
      yield* storeBytes

      const read = yield* service.getMany({ id: [record.id], userId: owner })
      const url = yield* service.download({ id: record.id, userId: owner })

      assertEquals(read, [record])
      assert.deepStrictEqual(Option.some(url.href), yield* bucketHref(stored.id))
    }).pipe(
      Effect.provide(
        fileAttachmentServiceOver({
          selectOne: selectsOne(record),
          selectMany: selectsMany(record),
        }),
      ),
    ),
  )

  it.effect('delete removes the row only while unbound, then the bytes', () => {
    const deleted: Array<AttachmentEntityWhere> = []
    return Effect.gen(function* () {
      const service = yield* FileAttachmentService
      yield* storeBytes

      yield* service.delete({ id: stored.id, userId: owner })

      assert.deepStrictEqual(deleted, [{ id: [stored.id], userId: owner, messageId: null }])
      assert.deepStrictEqual(yield* downloadBytes(stored.id), Option.none())
    }).pipe(
      Effect.provide(
        fileAttachmentServiceOver({
          selectOne: selectsOne(stored),
          selectMany: selectsMany(),
          delete: (where) =>
            Effect.sync(() => {
              deleted.push(where)
            }),
        }),
      ),
    )
  })

  it.effect.each([
    { name: 'a bound attachment', read: bound, uses: [] },
    { name: 'a library attachment sent to a chat', read: stored, uses: [record] },
  ])(
    'delete of $name is AttachmentBoundError naming the chat, deleting nothing',
    ({ read, uses }) =>
      Effect.gen(function* () {
        const service = yield* FileAttachmentService
        yield* storeBytes

        const error = yield* service.delete({ id: stored.id, userId: owner }).pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentBoundError,
          error,
          new AttachmentBoundError({ id: stored.id, chatIds: [chatId] }),
        )
        assert.deepStrictEqual(yield* downloadBytes(stored.id), Option.some(png))
      }).pipe(
        Effect.provide(
          fileAttachmentServiceOver({
            selectOne: selectsOne(read),
            selectMany: selectsMany(...uses),
          }),
        ),
      ),
  )

  it.effect(
    'delete whose row write dies, as a send bound it after the check, keeps the bytes',
    () =>
      Effect.gen(function* () {
        const service = yield* FileAttachmentService
        yield* storeBytes

        const exit = yield* service.delete({ id: stored.id, userId: owner }).pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(yield* downloadBytes(stored.id), Option.some(png))
      }).pipe(
        Effect.provide(
          fileAttachmentServiceOver({
            selectOne: selectsOne(stored),
            selectMany: selectsMany(),
            delete: () => Effect.die('no attachment named was unbound'),
          }),
        ),
      ),
  )
})
