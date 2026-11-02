import { Effect, Stream } from 'effect'

import type { UserId } from '@app-template/identity-contract'
import { AttachmentRepository } from '@app-template/kernel/data'
import { png } from '@app-template/packages/testing'

import type { AttachmentId } from '#domain/attachment.id'
import { FileName, MediaType } from '#domain/attachment.model'
import { decodeAttachments } from '#services/attachment.mapper'
import { AttachmentService } from '#services/attachment.service'

/** Uploads one `png` as `photo.png` for `userId` through the `AttachmentService` in context. */
export const upload = (userId: UserId) =>
  AttachmentService.use((attachments) =>
    attachments.upload(
      userId,
      Stream.make({
        fileName: FileName.make('photo.png'),
        mediaType: MediaType.make('image/png'),
        content: Stream.make(png),
      }),
    ),
  ).pipe(Effect.head, Effect.orDie)

export const selectAttachments = (ids: ReadonlyArray<AttachmentId>) =>
  AttachmentRepository.use((attachments) => attachments.selectMany({ id: ids })).pipe(
    Effect.flatMap(decodeAttachments),
  )
