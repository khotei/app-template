import { Effect, Layer } from 'effect'

import { AttachmentRepository } from '@app-template/domain/attachment'
import { MessageRepository } from '@app-template/domain/chat'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { MessageRepositoryPg } from '@app-template/infrastructure/chat'

/**
 * A write that runs once, on the next `selectActiveByChat` of any caller. Armed right before the
 * send under test, it lands after that send's active-message check and before its writes.
 */
export interface Interleaving {
  write: Effect.Effect<void>
}

/**
 * The Postgres message repository, yielding after `selectActiveByChat`, then running the armed
 * write.
 *
 * The yield hands the turn to a concurrent send or delete between this send's check and its
 * writes, where the armed write lands too.
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
  ).pipe(Layer.provide(MessageRepositoryPg))
  return { interleaving, layer }
}

/** The Postgres attachment repository, yielding after each `selectByIds`. */
export const AttachmentRepositoryYielding = Layer.effect(
  AttachmentRepository,
  Effect.map(AttachmentRepository, (inner) =>
    AttachmentRepository.of({
      ...inner,
      selectByIds: (ids) => Effect.tap(inner.selectByIds(ids), Effect.yieldNow),
    }),
  ),
).pipe(Layer.provide(AttachmentRepositoryPg))
