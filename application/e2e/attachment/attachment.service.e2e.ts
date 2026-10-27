import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Duration, Effect, Exit, HashMap, Layer, Option, Ref, Stream } from 'effect'
import { TestClock } from 'effect/testing'

import {
  Attachment,
  AttachmentBoundError,
  AttachmentBucket,
  type AttachmentId,
  AttachmentNotFoundError,
  AttachmentRepository,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import { buildUserMessage, ChatRepository, MessageRepository } from '@app-template/domain/chat'
import {
  AttachmentBucketObjects,
  AttachmentBucketTest,
  chat,
  chatId,
  epoch,
  messageId,
  owner,
  stranger,
  unknownAttachmentId,
} from '@app-template/domain/testing'
import type { UserId } from '@app-template/domain/user'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { ChatPg } from '@app-template/infrastructure/chat'
import { Db } from '@app-template/infrastructure/db'
import {
  assertSchemaEquals,
  breakAfter,
  isUuidV7,
  png,
  StreamBrokenError,
} from '@app-template/testing'

import { AttachmentService } from '#application/attachment/attachment.service'
import { upload } from '#application/testing/chat.test-layer'
import { DbWithUsersTest } from '#application/testing/db.test-layer'

const insertMessage = Effect.gen(function* () {
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository

  yield* chats.insert(chat)
  yield* messages.insert(buildUserMessage({ id: messageId, chatId, text: '', createdAt: epoch }))
})

/** `DbWithUsersTest` where `messageId` exists in a chat of `owner`, so an attachment can bind to it. */
const DbWithMessage = Layer.effectDiscard(insertMessage).pipe(
  Layer.provide(ChatPg),
  Layer.provideMerge(DbWithUsersTest),
)

/** The service over `repository` and `AttachmentBucketTest`, on a fresh test database. */
const layerAttachmentService = (repository: Layer.Layer<AttachmentRepository, never, Db>) =>
  AttachmentService.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(repository, AttachmentBucketTest)),
    Layer.provide(BunCrypto.layer),
    Layer.provideMerge(DbWithMessage),
  )

const AttachmentServiceTest = layerAttachmentService(AttachmentRepositoryPg)

const AttachmentRepositoryInsertDying = Layer.effect(
  AttachmentRepository,
  Effect.map(AttachmentRepository, (inner) =>
    AttachmentRepository.of({ ...inner, insert: () => Effect.die('the record write was lost') }),
  ),
).pipe(Layer.provide(AttachmentRepositoryPg))

const AttachmentServiceRecordLost = layerAttachmentService(AttachmentRepositoryInsertDying)

const photo = { fileName: FileName.make('photo.png'), mediaType: MediaType.make('image/png') }

const photoUpload = { ...photo, content: Stream.make(png) }

const uploadPhoto = upload(owner, 'photo.png')

const countStored = Effect.all({
  rows: Effect.flatMap(Db, (db) => db.query.attachments.findMany({ columns: { id: true } })).pipe(
    Effect.map(Arr.length),
    Effect.orDie,
  ),
  objects: Effect.flatMap(AttachmentBucketObjects, Ref.get).pipe(Effect.map(HashMap.size)),
})

const bucketHref = (id: AttachmentId) =>
  Effect.map(
    Effect.flatMap(AttachmentBucket, (bucket) => bucket.url(id)),
    Option.map((url) => url.href),
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

interface Addresser {
  readonly name: string
  readonly address: (
    service: AttachmentService['Service'],
    userId: UserId,
    id: AttachmentId,
  ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
}

const readers = [
  { name: 'get', address: (service, userId, id) => Effect.asVoid(service.get(userId, id)) },
  {
    name: 'download',
    address: (service, userId, id) => Effect.asVoid(service.download(userId, id)),
  },
] as const satisfies ReadonlyArray<Addresser>

const addressers = [
  ...readers,
  { name: 'delete', address: (service, userId, id) => service.delete(userId, id) },
  {
    name: 'bind',
    address: (service, userId, id) => Effect.asVoid(service.bind(userId, [id], messageId)),
  },
] as const satisfies ReadonlyArray<Addresser>

const bind = (attachment: Attachment) =>
  Effect.flatMap(AttachmentRepository, (attachments) =>
    attachments.update({ messageId: Option.some(messageId) }, { id: [attachment.id] }),
  )

const boundTo = (attachment: Attachment) =>
  new Attachment({ ...attachment, messageId: Option.some(messageId) })

const selectStored = (ids: ReadonlyArray<AttachmentId>) =>
  Effect.flatMap(AttachmentRepository, (attachments) => attachments.selectByIds(ids))

const selectBytes = (id: AttachmentId) =>
  Effect.flatMap(AttachmentBucket, (bucket) => bucket.select(id))

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
      assertEquals(yield* selectStored(Arr.map(uploaded, (attachment) => attachment.id)), uploaded)
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect.each(brokenUploads)(
    'upload with $name fails with its error and stores none of the files',
    ({ files }) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const broken = new StreamBrokenError()

        const error = yield* Effect.flip(service.upload(owner, files(broken)))
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
      yield* Effect.flatMap(AttachmentBucket, (bucket) => bucket.delete(attachment.id))

      const error = yield* Effect.flip(service.download(owner, attachment.id))

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

        const foreign = yield* Effect.flip(address(service, stranger, attachment.id))
        const missing = yield* Effect.flip(address(service, owner, unknownAttachmentId))

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

      const error = yield* Effect.flip(service.get(owner, attachment.id))
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

      const error = yield* Effect.flip(service.delete(stranger, attachment.id))
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

      const error = yield* Effect.flip(service.delete(owner, attachment.id))
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

        const bound = yield* service.bind(owner, [second.id, first.id], messageId)

        assertEquals(bound, [boundTo(second), boundTo(first)])
        assertEquals(yield* selectStored([second.id, first.id]), bound)
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('bind with a bound attachment is AttachmentBoundError and binds nothing else', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const free = yield* uploadPhoto
      const taken = yield* uploadPhoto
      yield* bind(taken)

      const error = yield* Effect.flip(service.bind(owner, [free.id, taken.id], messageId))

      assertSchemaEquals(AttachmentBoundError, error, new AttachmentBoundError({ id: taken.id }))
      assertEquals(yield* selectStored([free.id, taken.id]), [free, boundTo(taken)])
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )
  it.effect(
    'deleteByIds removes bound and unbound attachments with their bytes, and only them',
    () =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const unbound = yield* uploadPhoto
        const bound = yield* uploadPhoto
        yield* bind(bound)
        const kept = yield* uploadPhoto

        yield* service.deleteByIds([unbound.id, bound.id, unknownAttachmentId])

        assertEquals(yield* selectStored([unbound.id, bound.id, kept.id]), [kept])
        assert.deepStrictEqual(yield* selectBytes(unbound.id), Option.none())
        assert.deepStrictEqual(yield* selectBytes(bound.id), Option.none())
        assert.deepStrictEqual(yield* selectBytes(kept.id), Option.some(png))
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect.each(addressers)(
    '$name of an attachment unbound for 24 h is AttachmentNotFoundError and deletes nothing',
    ({ address }) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto
        yield* TestClock.adjust(Duration.hours(24))

        const error = yield* Effect.flip(address(service, owner, attachment.id))
        const stored = yield* selectStored([attachment.id])
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

      const exit = yield* Effect.exit(service.upload(owner, Stream.make(photoUpload)))
      const stored = yield* countStored

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(stored, { rows: 0, objects: 0 })
    }).pipe(Effect.provide(AttachmentServiceRecordLost)),
  )
})
