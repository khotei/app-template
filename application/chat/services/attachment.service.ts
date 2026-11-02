import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  HashMap,
  Layer,
  Option,
  Predicate,
  Ref,
  Stream,
} from 'effect'

import type { UserId } from '@app-template/application/identity'
import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'

import { type AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  type Attachment,
  bindAttachment,
  buildAttachment,
  ensureUnbound,
  FileSize,
  isExpiredAt,
} from '#chat/domain/attachment.model'
import type { ChatId, MessageId } from '#chat/domain/chat.id'
import {
  decodeAttachment,
  decodeAttachments,
  encodeAttachment,
} from '#chat/services/attachment.mapper'

export interface AttachmentUpload<E> extends Pick<Attachment, 'mediaType' | 'fileName'> {
  readonly content: Stream.Stream<Uint8Array, E>
}

/** The user's attachment; another user's reads as absent. */
export type AttachmentWhere = Pick<Attachment, 'id' | 'userId'>

/** An attachment unbound for `unboundLifetime` reads as not found; no read deletes it. */
export class AttachmentService extends Context.Service<
  AttachmentService,
  {
    /**
     * Stores each file in order, all or none: a failure of the files or of one file's content
     * removes the files already stored.
     */
    readonly upload: <E>(
      userId: UserId,
      uploads: Stream.Stream<AttachmentUpload<E>, E>,
    ) => Effect.Effect<ReadonlyArray<Attachment>, E>
    readonly getOne: (where: AttachmentWhere) => Effect.Effect<Attachment, AttachmentNotFoundError>
    readonly download: (where: AttachmentWhere) => Effect.Effect<URL, AttachmentNotFoundError>
    /** Removes the user's attachment while no message holds it. */
    readonly delete: (
      where: AttachmentWhere,
    ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
    /**
     * Checks the user's attachments under their rows' lock and answers the write that binds them
     * to the message of the chat, to run once that message is stored; the write answers them
     * bound, in the order asked. Of two sends binding one file the second waits on the lock and
     * fails `AttachmentBoundError`.
     */
    readonly bind: (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
      to: { readonly messageId: MessageId; readonly chatId: ChatId },
    ) => Effect.Effect<
      Effect.Effect<ReadonlyArray<Attachment>>,
      AttachmentNotFoundError | AttachmentBoundError
    >
  }
>()('@app-template/application/chat/services/AttachmentService', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const files = yield* FileRepository
    const crypto = yield* Crypto.Crypto
    const randomAttachmentId = generateId(crypto, AttachmentId.make)

    const uploadFile = Effect.fnUntraced(function* <E>(
      file: AttachmentUpload<E>,
      { id, userId }: { readonly id: AttachmentId; readonly userId: UserId },
    ) {
      const createdAt = yield* DateTime.now

      const size = yield* files.insert({ ...file, id }).pipe(Effect.map(FileSize.make))
      const attachment = buildAttachment({ ...file, id, userId, size, createdAt })
      const row = yield* encodeAttachment(attachment)

      yield* attachments.insert(row)
      return attachment
    })

    const upload = Effect.fn('AttachmentService.upload')(function* <E>(
      userId: UserId,
      uploads: Stream.Stream<AttachmentUpload<E>, E>,
    ) {
      // Bytes are tracked before the write, rows after the insert: a lost record still deletes
      // its bytes, and the cleanup deletes only rows that exist.
      const tracked = yield* Ref.make<ReadonlyArray<AttachmentId>>(Arr.empty())
      const stored = yield* Ref.make<ReadonlyArray<AttachmentId>>(Arr.empty())
      const trackId = randomAttachmentId.pipe(
        Effect.tap((id) => Ref.update(tracked, Arr.append(id))),
      )
      const storeId = (attachment: Attachment) => Ref.update(stored, Arr.append(attachment.id))
      const deleteTracked = Effect.gen(function* () {
        const storedIds = yield* Ref.get(stored)
        if (Arr.isReadonlyArrayNonEmpty(storedIds)) yield* attachments.delete({ id: storedIds })
        const trackedIds = yield* Ref.get(tracked)
        yield* files.delete({ id: trackedIds })
      })

      return yield* uploads.pipe(
        Stream.mapEffect((file) =>
          trackId.pipe(
            Effect.flatMap((id) => uploadFile(file, { id, userId })),
            Effect.tap(storeId),
          ),
        ),
        Stream.runCollect,
        Effect.onError(() => deleteTracked),
      )
    })

    const getOne = Effect.fn('AttachmentService.getOne')(function* (where: AttachmentWhere) {
      const found = yield* attachments.selectOne(where).pipe(Effect.flatMap(decodeAttachment))
      const now = yield* DateTime.now

      return yield* found.pipe(
        Option.filter(Predicate.not(isExpiredAt(now))),
        Effect.fromOption(() => new AttachmentNotFoundError({ id: where.id })),
      )
    })

    const download = Effect.fn('AttachmentService.download')(function* (where: AttachmentWhere) {
      const { id } = yield* getOne(where)

      return yield* files
        .url({ id })
        .pipe(Effect.flatMap(Effect.fromOption(() => new AttachmentNotFoundError({ id }))))
    })

    const remove = Effect.fn('AttachmentService.delete')(function* (where: AttachmentWhere) {
      const { id } = yield* getOne(where).pipe(ensureUnbound)

      // A send that binds it after the check makes this die, so its bytes stay.
      yield* attachments.delete({ id: [id], messageId: null })
      yield* files.delete({ id: [id] })
    })

    // One batch read; the refusal still names the first bad id in the order asked.
    const bind = Effect.fn('AttachmentService.bind')(function* (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
      to: { readonly messageId: MessageId; readonly chatId: ChatId },
    ) {
      // A send without files binds nothing, and the update below dies on no rows.
      if (Arr.isReadonlyArrayEmpty(ids)) return Effect.succeed(Arr.empty<Attachment>())
      // The rows stay locked until the send commits, so a concurrent bind of one of them waits
      // here and then finds it bound.
      const stored = yield* attachments
        .selectMany({ id: ids, userId }, { forUpdate: true })
        .pipe(Effect.flatMap(decodeAttachments))
      const now = yield* DateTime.now
      const found = HashMap.fromIterable(
        Arr.map(stored, (attachment) => [attachment.id, attachment]),
      )
      const bindFound = (id: AttachmentId) =>
        HashMap.get(found, id).pipe(
          Option.filter(Predicate.not(isExpiredAt(now))),
          Effect.fromOption(() => new AttachmentNotFoundError({ id })),
          Effect.flatMap((attachment) => bindAttachment(attachment, to)),
        )

      const bound = yield* Effect.forEach(ids, bindFound)

      return Effect.gen(function* () {
        // Bind the files first: unbound bytes expire, so a crash must never leave a bound row
        // over them.
        yield* Effect.forEach(ids, (id) => files.update({ bound: true }, { id }), { discard: true })
        yield* attachments.update(to, { id: ids, userId, messageId: null })
        return bound
      })
    })

    return { upload, getOne, download, delete: remove, bind }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
