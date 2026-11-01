import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Duration, Effect, Exit, HashMap, Layer, Option, Ref, Stream } from 'effect'
import { TestClock } from 'effect/testing'

import type { UserId } from '@app-template/identity-contract'
import { AttachmentRepository } from '@app-template/kernel/data/attachment'
import { AttachmentRows, RepositoryStackTest } from '@app-template/kernel/testing'
import {
  assertSchemaEquals,
  breakAfter,
  epoch,
  isUuidV7,
  png,
  StreamBrokenError,
} from '@app-template/testing'

import { AttachmentBoundError, AttachmentNotFoundError } from '#domain/attachment.error'
import type { AttachmentId } from '#domain/attachment.id'
import {
  Attachment,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '#domain/attachment.model'
import { AttachmentBucket } from '#domain/attachment.port'
import { AttachmentService } from '#services/attachment.service'
import { AttachmentBucketObjects, AttachmentBucketTest } from '#testing/attachment.test-fake'
import { unknownAttachmentId } from '#testing/attachment.test-fixture'
import { selectAttachments, upload } from '#testing/attachment.test-layer'
import { chatId, firstMessage, messageId, owner, stranger } from '#testing/chat.test-fixture'
import { insertMessage } from '#testing/chat.test-layer'

const MemoryStoresTest = Layer.merge(RepositoryStackTest, AttachmentBucketTest)

/** The service over the memory layers, on fresh rows where the message a send binds to exists. */
const AttachmentServiceTest = AttachmentService.layer.pipe(
  Layer.provideMerge(Layer.effectDiscard(insertMessage(firstMessage))),
  Layer.provideMerge(MemoryStoresTest),
  Layer.provide(BunCrypto.layer),
)

const AttachmentRepositoryInsertDying = Layer.effect(
  AttachmentRepository,
  AttachmentRepository.useSync((inner) =>
    AttachmentRepository.of({ ...inner, insert: () => Effect.die('the record write was lost') }),
  ),
)

const AttachmentServiceRecordLost = AttachmentService.layer.pipe(
  Layer.provide(AttachmentRepositoryInsertDying),
  Layer.provideMerge(MemoryStoresTest),
  Layer.provide(BunCrypto.layer),
)

const photo = { fileName: FileName.make('photo.png'), mediaType: MediaType.make('image/png') }

const photoUpload = { ...photo, content: Stream.make(png) }

const uploadPhoto = upload(owner)

const countStored = Effect.all({
  rows: AttachmentRows.use(Ref.get).pipe(Effect.map(HashMap.size)),
  objects: AttachmentBucketObjects.use(Ref.get).pipe(Effect.map(HashMap.size)),
})

const bucketHref = (id: AttachmentId) =>
  AttachmentBucket.use((bucket) => bucket.url(id)).pipe(Effect.map(Option.map((url) => url.href)))

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

interface Addresser {
  readonly name: string
  readonly address: (
    service: AttachmentService['Service'],
    userId: UserId,
    id: AttachmentId,
  ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
}

const readers = [
  { name: 'get', address: (service, userId, id) => service.get(userId, id).pipe(Effect.asVoid) },
  {
    name: 'download',
    address: (service, userId, id) => service.download(userId, id).pipe(Effect.asVoid),
  },
] as const satisfies ReadonlyArray<Addresser>

const addressers = [
  ...readers,
  { name: 'delete', address: (service, userId, id) => service.delete(userId, id) },
  {
    name: 'bind',
    address: (service, userId, id) => service.bind(userId, [id], message).pipe(Effect.asVoid),
  },
] as const satisfies ReadonlyArray<Addresser>

/** Where a send binds: the fixture message of the fixture chat. */
const message = { messageId, chatId }

const bind = (attachment: Attachment) =>
  AttachmentRepository.use((attachments) =>
    attachments.update({ messageId, chatId }, { id: [attachment.id] }),
  )

const boundTo = (attachment: Attachment) =>
  new Attachment({ ...attachment, messageId: Option.some(messageId), chatId: Option.some(chatId) })

const selectBytes = (id: AttachmentId) => AttachmentBucket.use((bucket) => bucket.select(id))

describe('AttachmentService', () => {
  it.effect('upload stores the bytes and the metadata of an unbound attachment', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService

      const attachment = yield* uploadPhoto
      const found = yield* service.get(owner, attachment.id)
      const bytes = yield* selectBytes(attachment.id)

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
      assertEquals(found, attachment)
      assert.deepStrictEqual(bytes, Option.some(png))
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('upload stores each file of the stream, in order', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const second = { ...photo, fileName: FileName.make('second.png') }

      const uploaded = yield* service.upload(
        owner,
        Stream.make(photoUpload, { ...second, content: Stream.make(png) }),
      )

      assert.deepStrictEqual(
        Arr.map(uploaded, (attachment) => attachment.fileName),
        [photo.fileName, second.fileName],
      )
      assertEquals(
        yield* selectAttachments(Arr.map(uploaded, (attachment) => attachment.id)),
        uploaded,
      )
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect.each(brokenUploads)(
    'upload with $name fails with its error and stores none of the files',
    ({ files }) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const broken = new StreamBrokenError()

        const error = yield* service.upload(owner, files(broken)).pipe(Effect.flip)
        const stored = yield* countStored

        assert.strictEqual(error, broken)
        assert.deepStrictEqual(stored, { rows: 0, objects: 0 })
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect("download returns the owner's attachment with the bucket's URL", () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto

      const download = yield* service.download(owner, attachment.id)
      const href = yield* bucketHref(attachment.id)

      assertEquals(download.attachment, attachment)
      assert.deepStrictEqual(Option.some(download.url.href), href)
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('download of an attachment whose bytes are gone is AttachmentNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto
      yield* AttachmentBucket.use((bucket) => bucket.delete([attachment.id]))

      const error = yield* service.download(owner, attachment.id).pipe(Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ id: attachment.id }),
      )
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect.each(readers)(
    "$name of another user's id or of an unknown id is AttachmentNotFoundError",
    ({ address }) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto

        const foreign = yield* address(service, stranger, attachment.id).pipe(Effect.flip)
        const missing = yield* address(service, owner, unknownAttachmentId).pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentNotFoundError,
          foreign,
          new AttachmentNotFoundError({ id: attachment.id }),
        )
        assertSchemaEquals(
          AttachmentNotFoundError,
          missing,
          new AttachmentNotFoundError({ id: unknownAttachmentId }),
        )
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('delete removes the metadata and the bytes of an unbound attachment', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto

      yield* service.delete(owner, attachment.id)

      const error = yield* service.get(owner, attachment.id).pipe(Effect.flip)
      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ id: attachment.id }),
      )
      assert.deepStrictEqual(yield* selectBytes(attachment.id), Option.none())
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect("delete of another user's attachment is AttachmentNotFoundError and keeps it", () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto

      const error = yield* service.delete(stranger, attachment.id).pipe(Effect.flip)
      const found = yield* service.get(owner, attachment.id)
      const bytes = yield* selectBytes(attachment.id)

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ id: attachment.id }),
      )
      assertEquals(found, attachment)
      assert.deepStrictEqual(bytes, Option.some(png))
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('delete of a bound attachment is AttachmentBoundError and leaves the bytes', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto
      yield* bind(attachment)

      const error = yield* service.delete(owner, attachment.id).pipe(Effect.flip)
      const bytes = yield* selectBytes(attachment.id)

      assertSchemaEquals(
        AttachmentBoundError,
        error,
        new AttachmentBoundError({ id: attachment.id }),
      )
      assert.deepStrictEqual(bytes, Option.some(png))
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect(
    "bind binds the user's attachments to the message and returns them in the order asked",
    () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const first = yield* uploadPhoto
        const second = yield* uploadPhoto

        const bound = yield* service.bind(owner, [second.id, first.id], message)

        assertEquals(bound, [boundTo(second), boundTo(first)])
        assertEquals(yield* selectAttachments([second.id, first.id]), bound)
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('bind names the first id not found in the order asked and binds nothing', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const free = yield* uploadPhoto
      const foreign = yield* upload(stranger)

      const strangerFirst = yield* service
        .bind(owner, [free.id, foreign.id, unknownAttachmentId], message)
        .pipe(Effect.flip)
      const unknownFirst = yield* service
        .bind(owner, [free.id, unknownAttachmentId, foreign.id], message)
        .pipe(Effect.flip)

      assertSchemaEquals(
        AttachmentNotFoundError,
        strangerFirst,
        new AttachmentNotFoundError({ id: foreign.id }),
      )
      assertSchemaEquals(
        AttachmentNotFoundError,
        unknownFirst,
        new AttachmentNotFoundError({ id: unknownAttachmentId }),
      )
      assertEquals(yield* selectAttachments([free.id, foreign.id]), [free, foreign])
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('bind with a bound attachment is AttachmentBoundError and binds nothing else', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const free = yield* uploadPhoto
      const taken = yield* uploadPhoto
      yield* bind(taken)

      const error = yield* service.bind(owner, [free.id, taken.id], message).pipe(Effect.flip)

      assertSchemaEquals(AttachmentBoundError, error, new AttachmentBoundError({ id: taken.id }))
      assertEquals(yield* selectAttachments([free.id, taken.id]), [free, boundTo(taken)])
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect.each(addressers)(
    '$name of an attachment unbound for 24 h is AttachmentNotFoundError and deletes nothing',
    ({ address }) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto
        yield* TestClock.adjust(Duration.hours(24))

        const error = yield* address(service, owner, attachment.id).pipe(Effect.flip)
        const stored = yield* selectAttachments([attachment.id])
        const bytes = yield* selectBytes(attachment.id)

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ id: attachment.id }),
        )
        assertEquals(stored, [attachment])
        assert.deepStrictEqual(bytes, Option.some(png))
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('upload aborted after the bytes were written leaves neither bytes nor a record', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService

      const exit = yield* service.upload(owner, Stream.make(photoUpload)).pipe(Effect.exit)
      const stored = yield* countStored

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(stored, { rows: 0, objects: 0 })
    }).pipe(Effect.provide(AttachmentServiceRecordLost)),
  )
})
