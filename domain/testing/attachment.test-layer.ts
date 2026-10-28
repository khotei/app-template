import { Array as Arr, Effect, Stream } from 'effect'

import { png } from '@app-template/testing'

import { FileName, MediaType } from '#domain/attachment/attachment.model'
import { AttachmentService } from '#domain/attachment/attachment.service'
import type { UserId } from '#domain/user/user.id'

/** Uploads one `png` named `name` for `userId` through the `AttachmentService` in context. */
export const upload = (userId: UserId, name: string) =>
  Effect.flatMap(AttachmentService, (attachments) =>
    attachments.upload(
      userId,
      Stream.make({
        fileName: FileName.make(name),
        mediaType: MediaType.make('image/png'),
        content: Stream.make(png),
      }),
    ),
  ).pipe(
    Effect.flatMap((uploaded) => Effect.fromOption(Arr.head(uploaded))),
    Effect.orDie,
  )
