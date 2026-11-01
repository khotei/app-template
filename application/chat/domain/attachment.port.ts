import { Context, type Effect, type Option, type Stream } from 'effect'

import type { AttachmentId } from '#domain/attachment.id'
import type { AttachmentMeta, FileSize } from '#domain/attachment.model'

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
    /** Idempotent, in as few requests as the store allows. */
    readonly delete: (ids: ReadonlyArray<AttachmentId>) => Effect.Effect<void>
  }
>()('@app-template/chat/domain/AttachmentBucket') {}
