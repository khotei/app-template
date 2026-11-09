import {
  Array as Arr,
  DateTime,
  Duration,
  Effect,
  flow,
  Option,
  Predicate,
  pipe,
  Schema,
  Struct,
  type Types,
} from 'effect'

import { UserId } from '@app-template/application/identity'
import { mediaTypePattern, minFileSize } from '@app-template/kernel/data'

import { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import { ChatId, MessageId } from '#chat/domain/chat.id'

export const FileName = Schema.String.check(Schema.isNonEmpty()).pipe(Schema.brand('FileName'))
export type FileName = typeof FileName.Type

/** A `type/subtype` pair of RFC 6838 restricted-name characters, without parameters. */
export const MediaType = Schema.String.check(Schema.isPattern(mediaTypePattern)).pipe(
  Schema.brand('MediaType'),
)
export type MediaType = typeof MediaType.Type

export const FileSize = Schema.Int.check(Schema.isGreaterThanOrEqualTo(minFileSize)).pipe(
  Schema.brand('FileSize'),
)
export type FileSize = typeof FileSize.Type

export class Attachment extends Schema.Class<Attachment>('Attachment')({
  id: AttachmentId,
  userId: UserId,
  messageId: Schema.Option(MessageId),
  /** The chat of `messageId`, set with it, so a chat's attachments are found without its messages. */
  chatId: Schema.Option(ChatId),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtc,
}) {}

export const buildAttachment = (
  fields: Types.Simplify<
    Pick<Attachment, 'id' | 'userId' | 'fileName' | 'mediaType' | 'size' | 'createdAt'>
  >,
): Attachment => new Attachment({ ...fields, messageId: Option.none(), chatId: Option.none() })

export const unboundLifetime = Duration.hours(24)

const isUnbound: Predicate.Predicate<Attachment> = (attachment) =>
  Option.isNone(attachment.messageId)

const isExpiredAt = (now: DateTime.Utc): Predicate.Predicate<Attachment> =>
  Predicate.and(isUnbound, (attachment) =>
    DateTime.isGreaterThanOrEqualTo(
      now,
      DateTime.addDuration(attachment.createdAt, unboundLifetime),
    ),
  )

/** Bound, or unbound for less than `unboundLifetime` at `now`. */
export const isLiveAt = (now: DateTime.Utc): Predicate.Predicate<Attachment> =>
  Predicate.not(isExpiredAt(now))

/** The value found for the attachment `id`; an absent one fails `AttachmentNotFoundError` naming `id`. */
export const ensureFound = (id: AttachmentId) =>
  Effect.fromOption(() => new AttachmentNotFoundError({ ids: [id] }))

/** Fails `AttachmentNotFoundError` naming the attachment when it is not live at `now`. */
export const ensureLive = (now: DateTime.Utc) =>
  Effect.filterOrFail<Attachment, AttachmentNotFoundError>(
    isLiveAt(now),
    (attachment) => new AttachmentNotFoundError({ ids: [attachment.id] }),
  )

/** `found` when it holds every id of `ids`; else one error naming each missing id once, in the order asked. */
const ensureAllFound =
  (ids: ReadonlyArray<AttachmentId>) =>
  (
    found: ReadonlyArray<Attachment>,
  ): Effect.Effect<ReadonlyArray<Attachment>, AttachmentNotFoundError> =>
    pipe(
      ids,
      Arr.difference(Arr.map(found, Struct.get('id'))),
      Arr.dedupe,
      Arr.match({
        onEmpty: () => Effect.succeed(found),
        onNonEmpty: (missing) => Effect.fail(new AttachmentNotFoundError({ ids: missing })),
      }),
    )

/** The attachments read, less the expired ones, when they hold every id of `ids` at `now`. */
export const ensureAllLive = (ids: ReadonlyArray<AttachmentId>, now: DateTime.Utc) =>
  flow(Arr.filter(isLiveAt(now)), ensureAllFound(ids))

const isStoredIn =
  (stored: ReadonlyArray<AttachmentId>): Predicate.Predicate<Attachment> =>
  (attachment) =>
    Arr.contains(stored, attachment.id)

/**
 * Keeps the attachments whose id is in `stored`, the ids whose bytes the object store holds;
 * fails `AttachmentNotFoundError` naming each id of `ids` left out, once, in the order asked.
 */
export const ensureAllStored = (
  ids: ReadonlyArray<AttachmentId>,
  stored: ReadonlyArray<AttachmentId>,
) => flow(Arr.filter(isStoredIn(stored)), ensureAllFound(ids))

/** Fails `AttachmentBoundError` for an attachment a message holds. */
export const ensureUnbound = Effect.filterOrFail<Attachment, AttachmentBoundError>(
  isUnbound,
  (attachment) => new AttachmentBoundError({ id: attachment.id }),
)

/** The attachments when no message holds any; else `AttachmentBoundError` naming the first bound. */
export const ensureAllUnbound = (attachments: ReadonlyArray<Attachment>) =>
  Effect.forEach(attachments, (attachment) => Effect.succeed(attachment).pipe(ensureUnbound))

/** Binds the attachment to the message and its chat; one a message holds is `AttachmentBoundError`. */
export const bindAttachment = Effect.fn('bindAttachment')(
  (attachment: Attachment, message: { readonly id: MessageId; readonly chatId: ChatId }) =>
    Effect.succeed(attachment).pipe(
      ensureUnbound,
      Effect.map(
        (unbound) =>
          new Attachment({
            ...unbound,
            messageId: Option.some(message.id),
            chatId: Option.some(message.chatId),
          }),
      ),
    ),
)
