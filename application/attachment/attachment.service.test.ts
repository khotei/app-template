import { BunCrypto } from '@effect/platform-bun'
import { assert } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import {
  Array as Arr,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Record as Rec,
  Stream,
} from 'effect'
import { TestClock, TestCrypto } from 'effect/testing'

import { countAttachmentObjects } from '@app-template/aws/testing'
import {
  Attachment,
  AttachmentBoundError,
  type AttachmentId,
  AttachmentNotFoundError,
  AttachmentRepository,
  AttachmentStore,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import {
  buildChat,
  buildUserMessage,
  ChatRepository,
  MessageRepository,
} from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { ChatPg } from '@app-template/infrastructure/chat'
import { Db } from '@app-template/infrastructure/db'
import {
  assertSchemaEquals,
  breakAfter,
  describeOnMiniStack,
  isUuidV7,
  png,
  StreamBrokenError,
} from '@app-template/testing'

import { AttachmentService } from '#application/attachment/attachment.service'
import { unknownAttachmentId } from '#application/testing/attachment.fixture'
import { chatId, epoch, messageId } from '#application/testing/chat.fixture'
import { AttachmentStoreOwnBucket, DbWithUsers, upload } from '#application/testing/chat.harness'
import { owner, stranger } from '#application/testing/user.fixture'

const CryptoTest = TestCrypto.layer('attachment-service').pipe(Layer.provide(BunCrypto.layer))

const insertMessage = Effect.gen(function* () {
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository

  yield* chats.insert(buildChat({ id: chatId, userId: owner, createdAt: epoch }))
  yield* messages.insert(
    buildUserMessage({ id: messageId, chatId, text: '', attachmentIds: [], createdAt: epoch }),
  )
})

/** `DbWithUsers` where `messageId` exists in a chat of `owner`, so an attachment can bind to it. */
const DbWithMessage = Layer.effectDiscard(insertMessage).pipe(
  Layer.provide(ChatPg),
  Layer.provideMerge(DbWithUsers),
)

/** The service over `stores`, on a fresh test database where `messageId` exists. */
const layerAttachmentService = <A, E, R>(
  stores: Layer.Layer<A | AttachmentRepository | AttachmentStore, E, R>,
) =>
  AttachmentService.layer.pipe(
    Layer.provideMerge(stores),
    Layer.provide(CryptoTest),
    Layer.provideMerge(DbWithMessage),
  )

const AttachmentServiceTest = layerAttachmentService(
  Layer.mergeAll(AttachmentRepositoryPg, AttachmentStoreOwnBucket),
)

const AttachmentRepositoryInsertDying = Layer.effect(
  AttachmentRepository,
  Effect.map(AttachmentRepository, (inner) =>
    AttachmentRepository.of({ ...inner, insert: () => Effect.die('the record write was lost') }),
  ),
).pipe(Layer.provide(AttachmentRepositoryPg))

const AttachmentServiceRecordLost = layerAttachmentService(
  Layer.mergeAll(AttachmentRepositoryInsertDying, AttachmentStoreOwnBucket),
)

interface AttachmentWrite {
  readonly call: 'store.keep' | 'repository.update'
  readonly id: AttachmentId
}

const recordAttachmentWrites = () => {
  const writes: Array<AttachmentWrite> = []
  const record = (call: AttachmentWrite['call'], id: AttachmentId) =>
    Effect.sync(() => writes.push({ call, id }))
  const store = Layer.effect(
    AttachmentStore,
    Effect.map(AttachmentStore, (inner) =>
      AttachmentStore.of({
        ...inner,
        keep: (id) => Effect.andThen(record('store.keep', id), inner.keep(id)),
      }),
    ),
  ).pipe(Layer.provide(AttachmentStoreOwnBucket))
  const repository = Layer.effect(
    AttachmentRepository,
    Effect.map(AttachmentRepository, (inner) =>
      AttachmentRepository.of({
        ...inner,
        update: (attachment) =>
          Effect.andThen(record('repository.update', attachment.id), inner.update(attachment)),
      }),
    ),
  ).pipe(Layer.provide(AttachmentRepositoryPg))
  return { writes, layer: Layer.mergeAll(store, repository) }
}

const callsTo = (writes: ReadonlyArray<AttachmentWrite>, id: AttachmentId) =>
  Arr.map(
    Arr.filter(writes, (write) => write.id === id),
    (write) => write.call,
  )

const photo = { fileName: FileName.make('photo.png'), mediaType: MediaType.make('image/png') }

const photoUpload = { ...photo, content: Stream.make(png) }

const uploadPhoto = upload(owner, 'photo.png')

const countStored = Effect.all({
  rows: Effect.flatMap(Db, (db) => db.query.attachments.findMany({ columns: { id: true } })).pipe(
    Effect.map(Arr.length),
    Effect.orDie,
  ),
  objects: countAttachmentObjects,
})

const storeHref = (id: AttachmentId) =>
  Effect.map(
    Effect.flatMap(AttachmentStore, (store) => store.url(id)),
    Option.map((url) => url.href),
  )

const brokenUploads = {
  "a later file's content breaking part-way": (broken: StreamBrokenError) =>
    Stream.make(photoUpload, { ...photo, content: breakAfter([png], broken) }),
  'the files breaking after the first one': (broken: StreamBrokenError) =>
    breakAfter([photoUpload], broken),
} as const

type Address = (
  service: AttachmentService['Service'],
  userId: UserId,
  id: AttachmentId,
) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>

const addressers = {
  get: (service, userId, id) => Effect.asVoid(service.get(userId, id)),
  download: (service, userId, id) => Effect.asVoid(service.download(userId, id)),
  delete: (service, userId, id) => service.delete(userId, id),
  findBindable: (service, userId, id) => Effect.asVoid(service.findBindable(userId, [id])),
} as const satisfies Record<string, Address>

const bind = (attachment: Attachment) =>
  Effect.flatMap(AttachmentRepository, (attachments) =>
    attachments.update(new Attachment({ ...attachment, messageId: Option.some(messageId) })),
  )

const selectStored = (ids: ReadonlyArray<AttachmentId>) =>
  Effect.flatMap(AttachmentRepository, (attachments) => attachments.selectByIds(ids))

const selectBytes = (id: AttachmentId) =>
  Effect.flatMap(AttachmentStore, (store) => store.select(id))

describeOnMiniStack('AttachmentService', (it) => {
  it.effect('upload stores the bytes and the metadata of an unbound attachment', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const now = DateTime.makeUnsafe('2026-10-18T12:00:00.000Z')
      yield* TestClock.setTime(DateTime.toEpochMillis(now))

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
          createdAt: now,
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

  it.effect.each(Rec.keys(brokenUploads))(
    'upload with %s fails with its error and stores none of the files',
    (name) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const broken = new StreamBrokenError()

        const error = yield* Effect.flip(service.upload(owner, brokenUploads[name](broken)))
        const stored = yield* countStored

        assert.strictEqual(error, broken)
        assert.deepStrictEqual(stored, { rows: 0, objects: 0 })
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect("download returns the owner's attachment with the store's URL", () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto

      const download = yield* service.download(owner, attachment.id)
      const href = yield* storeHref(attachment.id)

      assertEquals(download.attachment, attachment)
      assert.deepStrictEqual(Option.some(download.url.href), href)
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('download of an attachment whose bytes are gone is AttachmentNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachment = yield* uploadPhoto
      yield* Effect.flatMap(AttachmentStore, (store) => store.delete(attachment.id))

      const error = yield* Effect.flip(service.download(owner, attachment.id))

      assertSchemaEquals(
        AttachmentNotFoundError,
        error,
        new AttachmentNotFoundError({ id: attachment.id }),
      )
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect.each(['get', 'download'] as const)(
    "%s of another user's id or of an unknown id is AttachmentNotFoundError",
    (method) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto

        const foreign = yield* Effect.flip(addressers[method](service, stranger, attachment.id))
        const missing = yield* Effect.flip(addressers[method](service, owner, unknownAttachmentId))

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
      assert.deepStrictEqual(yield* (yield* AttachmentStore).select(attachment.id), Option.none())
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

  it.effect("findBindable returns the user's unbound attachments in the order asked", () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const first = yield* uploadPhoto
      const second = yield* uploadPhoto

      const bindable = yield* service.findBindable(owner, [second.id, first.id])

      assertEquals(bindable.attachments, [second, first])
    }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect('bind stores the attachments bound to the message and returns them', () =>
    Effect.gen(function* () {
      const service = yield* AttachmentService
      const attachments = [yield* uploadPhoto, yield* uploadPhoto]
      const bindable = yield* service.findBindable(
        owner,
        Arr.map(attachments, (attachment) => attachment.id),
      )

      const bound = yield* service.bind(bindable, messageId)

      assertEquals(
        bound,
        Arr.map(
          attachments,
          (attachment) => new Attachment({ ...attachment, messageId: Option.some(messageId) }),
        ),
      )
      assertEquals(yield* selectStored(Arr.map(attachments, (attachment) => attachment.id)), bound)
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

  it.effect.each(Rec.keys(addressers))(
    '%s of an attachment unbound for 24 h is AttachmentNotFoundError and deletes nothing',
    (method) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto
        yield* TestClock.adjust(Duration.hours(24))

        const error = yield* Effect.flip(addressers[method](service, owner, attachment.id))
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

  it.effect.each(Rec.keys(addressers))(
    '%s of an attachment unbound for 23 h 59 min finds it',
    (method) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto
        yield* TestClock.adjust(Duration.sum(Duration.hours(23), Duration.minutes(59)))

        yield* addressers[method](service, owner, attachment.id)
      }).pipe(Effect.provide(AttachmentServiceTest)),
  )

  it.effect.each(['get', 'download'] as const)(
    '%s of a bound attachment 48 h after its upload finds it',
    (method) =>
      Effect.gen(function* () {
        const service = yield* AttachmentService
        const attachment = yield* uploadPhoto
        yield* bind(attachment)
        yield* TestClock.adjust(Duration.hours(48))

        yield* addressers[method](service, owner, attachment.id)
        const stored = yield* selectStored([attachment.id])

        assert.strictEqual(Arr.length(stored), 1)
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

  it.effect("bind keeps each attachment's bytes before it writes the bind", () => {
    const recorded = recordAttachmentWrites()
    return Effect.gen(function* () {
      const service = yield* AttachmentService
      const first = yield* uploadPhoto
      const second = yield* uploadPhoto
      const attachments = [first, second]
      const bindable = yield* service.findBindable(
        owner,
        Arr.map(attachments, (attachment) => attachment.id),
      )

      yield* service.bind(bindable, messageId)

      assert.deepStrictEqual(
        Arr.map(attachments, (attachment) => callsTo(recorded.writes, attachment.id)),
        [
          ['store.keep', 'repository.update'],
          ['store.keep', 'repository.update'],
        ],
      )
    }).pipe(Effect.provide(layerAttachmentService(recorded.layer)))
  })
})
