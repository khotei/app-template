import { Context, type Effect, type Option, type Stream, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { AttachmentId } from '#domain/attachment/attachment.id'
import type { Attachment, AttachmentMeta, FileSize } from '#domain/attachment/attachment.model'

export type AttachmentSet = Types.Simplify<RequireAtLeastOne<Pick<Attachment, 'messageId'>>>

/** The rows are found by `id`; any other field must still hold its value. */
export type AttachmentWhere = Types.Simplify<
  { readonly id: ReadonlyArray<AttachmentId> } & Partial<Pick<Attachment, 'messageId'>>
>

export class AttachmentRepository extends Context.Service<
  AttachmentRepository,
  {
    readonly insert: (attachment: Attachment) => Effect.Effect<void>
    /** Writes `set` where `where` holds, in one statement; returns the attachments it wrote, unordered. */
    readonly update: (
      set: AttachmentSet,
      where: AttachmentWhere,
    ) => Effect.Effect<ReadonlyArray<Attachment>>
    readonly selectById: (id: AttachmentId) => Effect.Effect<Option.Option<Attachment>>
    /** Returns the attachments found, in the order asked; unknown ids are left out. */
    readonly selectByIds: (
      ids: ReadonlyArray<AttachmentId>,
    ) => Effect.Effect<ReadonlyArray<Attachment>>
    /** Deletes the attachments found; unknown ids are skipped. */
    readonly deleteByIds: (ids: ReadonlyArray<AttachmentId>) => Effect.Effect<void>
  }
>()('@app-template/domain/attachment/AttachmentRepository') {}

export class AttachmentBucket extends Context.Service<
  AttachmentBucket,
  {
    /** Writes the bytes marked unbound; fails with the stream's error and leaves nothing behind. */
    readonly insert: <E>(
      id: AttachmentId,
      content: Stream.Stream<Uint8Array, E>,
      meta: AttachmentMeta,
    ) => Effect.Effect<FileSize, E>
    readonly select: (id: AttachmentId) => Effect.Effect<Option.Option<Uint8Array>>
    /**
     * A URL that serves the bytes with the stored media type and inline disposition; none for
     * an id without bytes.
     */
    readonly url: (id: AttachmentId) => Effect.Effect<Option.Option<URL>>
    /**
     * Clears the unbound mark, so lifecycle never collects the bytes; idempotent, and a no-op for
     * an id without bytes.
     */
    readonly keep: (id: AttachmentId) => Effect.Effect<void>
    /** Idempotent. */
    readonly delete: (id: AttachmentId) => Effect.Effect<void>
  }
>()('@app-template/domain/attachment/AttachmentBucket') {}
