import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import {
  Array as Arr,
  Duration,
  Effect,
  Exit,
  HashMap,
  Layer,
  Option,
  Order,
  Ref,
  Stream,
  Struct,
} from 'effect'
import { TestClock } from 'effect/testing'

import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { AttachmentRows, FileObjects, RepositoryStackTest } from '@app-template/kernel/data/testing'
import {
  assertSchemaEquals,
  breakAfter,
  epoch,
  isUuidV7,
  png,
  StreamBrokenError,
} from '@app-template/packages/testing'

import { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import type { AttachmentId } from '#chat/domain/attachment.id'
import {
  type Attachment,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '#chat/domain/attachment.model'
import { FileAttachmentService } from '#chat/services/file-attachment.service'
import { selectAttachments, upload } from '#testing/chat/attachment.test-layer'
import { chatId, firstMessage, messageId, owner } from '#testing/chat/chat.test-fixture'
import { insertMessage } from '#testing/chat/chat.test-layer'

/** The service over the memory layers, on fresh rows where the message a send binds to exists. */
const FileAttachmentServiceTest = FileAttachmentService.layer.pipe(
  Layer.provideMerge(Layer.effectDiscard(insertMessage(firstMessage))),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide(BunCrypto.layer),
)

const AttachmentRepositoryInsertDying = Layer.effect(
  AttachmentRepository,
  AttachmentRepository.useSync((inner) =>
    AttachmentRepository.of({ ...inner, insert: () => Effect.die('the record write was lost') }),
  ),
)

const FileAttachmentServiceRecordLost = FileAttachmentService.layer.pipe(
  Layer.provide(AttachmentRepositoryInsertDying),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide(BunCrypto.layer),
)

/** A send binds the attachment between the service's check and its delete. */
const AttachmentRepositoryBoundBeforeDelete = Layer.effect(
  AttachmentRepository,
  AttachmentRepository.useSync((inner) =>
    AttachmentRepository.of({
      ...inner,
      delete: (where) =>
        inner
          .update({ messageId, chatId }, { id: where.id })
          .pipe(Effect.andThen(inner.delete(where))),
    }),
  ),
)

const FileAttachmentServiceBoundBeforeDelete = FileAttachmentService.layer.pipe(
  Layer.provide(AttachmentRepositoryBoundBeforeDelete),
  Layer.provideMerge(Layer.effectDiscard(insertMessage(firstMessage))),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide(BunCrypto.layer),
)

const photo = { fileName: FileName.make('photo.png'), mediaType: MediaType.make('image/png') }

const photoUpload = { ...photo, content: Stream.make(png) }

const uploadPhoto = upload(owner)

const countStored = Effect.all({
  rows: AttachmentRows.use(Ref.get).pipe(Effect.map(HashMap.size)),
  objects: FileObjects.use(Ref.get).pipe(Effect.map(HashMap.size)),
})

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

const bind = (attachment: Attachment) =>
  AttachmentRepository.use((attachments) =>
    attachments.update({ messageId, chatId }, { id: [attachment.id] }),
  )

const downloadBytes = (id: AttachmentId) =>
  FileRepository.use((files) => files.download({ id })).pipe(
    Effect.map(Option.map(Struct.get('blob'))),
  )

describe('FileAttachmentService', () => {
  it.effect('upload stores the bytes and the metadata of an unbound attachment', () =>
    Effect.gen(function* () {
      const attachment = yield* uploadPhoto
      const stored = yield* selectAttachments([attachment.id])
      const bytes = yield* downloadBytes(attachment.id)

      assert.isTrue(isUuidV7(attachment.id))
      assertEquals(
        attachment,
        buildAttachment({
          ...photo,
          id: attachment.id,
          userId: owner,
          size: FileSize.make(png.length),
          createdAt: epoch,
        }),
      )
      assertEquals(stored, [attachment])
      assert.deepStrictEqual(bytes, Option.some(png))
    }).pipe(Effect.provide(FileAttachmentServiceTest)),
  )

  it.effect('upload stores each file of the stream, in order', () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService
      const second = { ...photo, fileName: FileName.make('second.png') }

      const uploaded = yield* service.upload(
        owner,
        Stream.make(photoUpload, { ...second, content: Stream.make(png) }),
      )

      assert.deepStrictEqual(
        Arr.map(uploaded, (attachment) => attachment.fileName),
        [photo.fileName, second.fileName],
      )
      // Both share the test clock's `createdAt`, so the rows come back in no defined order.
      const byId = (attachments: ReadonlyArray<Attachment>) =>
        Arr.sortWith(attachments, (attachment) => attachment.id, Order.String)
      const stored = yield* selectAttachments(Arr.map(uploaded, (attachment) => attachment.id))
      assertEquals(byId(stored), byId(uploaded))
    }).pipe(Effect.provide(FileAttachmentServiceTest)),
  )

  it.effect.each(brokenUploads)(
    'upload with $name fails with its error and stores none of the files',
    ({ files }) =>
      Effect.gen(function* () {
        const service = yield* FileAttachmentService
        const broken = new StreamBrokenError()

        const error = yield* service.upload(owner, files(broken)).pipe(Effect.flip)
        const stored = yield* countStored

        assert.strictEqual(error, broken)
        assert.deepStrictEqual(stored, { rows: 0, objects: 0 })
      }).pipe(Effect.provide(FileAttachmentServiceTest)),
  )

  it.effect("download returns the bucket's URL of the owner's attachment", () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService
      const attachment = yield* uploadPhoto

      const url = yield* service.download({ id: attachment.id, userId: owner })
      const href = yield* bucketHref(attachment.id)

      assert.deepStrictEqual(Option.some(url.href), href)
    }).pipe(Effect.provide(FileAttachmentServiceTest)),
  )

  it.effect('download of an attachment whose bytes are gone is AttachmentNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService
      const attachment = yield* uploadPhoto
      yield* FileRepository.use((files) => files.delete({ id: [attachment.id] }))

      const error = yield* service.download({ id: attachment.id, userId: owner }).pipe(Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ ids: [attachment.id] }),
      )
    }).pipe(Effect.provide(FileAttachmentServiceTest)),
  )

  it.effect('delete removes the metadata and the bytes of an unbound attachment', () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService
      const attachment = yield* uploadPhoto

      yield* service.delete({ id: attachment.id, userId: owner })

      assert.deepStrictEqual(yield* selectAttachments([attachment.id]), [])
      assert.deepStrictEqual(yield* downloadBytes(attachment.id), Option.none())
    }).pipe(Effect.provide(FileAttachmentServiceTest)),
  )

  it.effect('delete of a bound attachment is AttachmentBoundError and leaves the bytes', () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService
      const attachment = yield* uploadPhoto
      yield* bind(attachment)

      const error = yield* service.delete({ id: attachment.id, userId: owner }).pipe(Effect.flip)
      const bytes = yield* downloadBytes(attachment.id)

      assertSchemaEquals(
        AttachmentBoundError,
        error,
        new AttachmentBoundError({ id: attachment.id }),
      )
      assert.deepStrictEqual(bytes, Option.some(png))
    }).pipe(Effect.provide(FileAttachmentServiceTest)),
  )

  it.effect(
    'delete of an attachment unbound for 24 h is AttachmentNotFoundError and deletes nothing',
    () =>
      Effect.gen(function* () {
        const service = yield* FileAttachmentService
        const attachment = yield* uploadPhoto
        yield* TestClock.adjust(Duration.hours(24))

        const error = yield* service.delete({ id: attachment.id, userId: owner }).pipe(Effect.flip)
        const stored = yield* selectAttachments([attachment.id])
        const bytes = yield* downloadBytes(attachment.id)

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ ids: [attachment.id] }),
        )
        assertEquals(stored, [attachment])
        assert.deepStrictEqual(bytes, Option.some(png))
      }).pipe(Effect.provide(FileAttachmentServiceTest)),
  )

  it.effect('delete of an attachment a send binds after the check dies and keeps it whole', () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService
      const attachment = yield* uploadPhoto

      const exit = yield* service.delete({ id: attachment.id, userId: owner }).pipe(Effect.exit)
      const stored = yield* selectAttachments([attachment.id])
      const bytes = yield* downloadBytes(attachment.id)

      assert.isTrue(Exit.hasDies(exit))
      assert.strictEqual(stored.length, 1)
      assert.deepStrictEqual(bytes, Option.some(png))
    }).pipe(Effect.provide(FileAttachmentServiceBoundBeforeDelete)),
  )

  it.effect('upload aborted after the bytes were written leaves neither bytes nor a record', () =>
    Effect.gen(function* () {
      const service = yield* FileAttachmentService

      const exit = yield* service.upload(owner, Stream.make(photoUpload)).pipe(Effect.exit)
      const stored = yield* countStored

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(stored, { rows: 0, objects: 0 })
    }).pipe(Effect.provide(FileAttachmentServiceRecordLost)),
  )
})
