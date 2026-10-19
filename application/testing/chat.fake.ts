import { Effect, Layer } from 'effect'

import { AttachmentRepository } from '@app-template/domain/attachment'
import { MessageRepository } from '@app-template/domain/chat'
import { AttachmentRepositoryKv } from '@app-template/infrastructure/attachment'
import { MessageRepositoryKv } from '@app-template/infrastructure/chat'

/**
 * A write that runs once, on the next `selectActiveByChat` of any caller. Armed right before the
 * send under test, it lands after that send's active-message check and before its writes.
 */
export interface Interleaving {
  write: Effect.Effect<void>
}

/**
 * The KV message repository, yielding after `selectActiveByChat` and then running the armed write.
 *
 * The memory store never yields, so a fiber would finish its send before the next one starts;
 * the yield after each check lets two concurrent sends interleave between check and write.
 */
export const interleaveMessages = () => {
  const interleaving: Interleaving = { write: Effect.void }
  const takeInterleaving = Effect.suspend(() => {
    const { write } = interleaving
    interleaving.write = Effect.void
    return write
  })
  const layer = Layer.effect(
    MessageRepository,
    Effect.map(MessageRepository, (inner) =>
      MessageRepository.of({
        ...inner,
        selectActiveByChat: (chatId) =>
          Effect.tap(inner.selectActiveByChat(chatId), () =>
            Effect.andThen(Effect.yieldNow, takeInterleaving),
          ),
      }),
    ),
  ).pipe(Layer.provide(MessageRepositoryKv))
  return { interleaving, layer }
}

/** The KV attachment repository, yielding after each `selectByIds`. */
export const AttachmentRepositoryYielding = Layer.effect(
  AttachmentRepository,
  Effect.map(AttachmentRepository, (inner) =>
    AttachmentRepository.of({
      ...inner,
      selectByIds: (ids) => Effect.tap(inner.selectByIds(ids), Effect.yieldNow),
    }),
  ),
).pipe(Layer.provide(AttachmentRepositoryKv))
