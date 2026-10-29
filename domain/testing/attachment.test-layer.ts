import { Array as Arr, Effect, Stream } from 'effect'

import { png } from '@app-template/testing'

import { FileName, MediaType } from '#domain/attachment/attachment.model'
import { AttachmentService } from '#domain/attachment/attachment.service'
import type { UserId } from '#domain/user/user.id'

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
  ).pipe(
    Effect.flatMap((uploaded) => Effect.fromOption(Arr.head(uploaded))),
    Effect.orDie,
  )
