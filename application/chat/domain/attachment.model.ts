import {
  Array as Arr,
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
  messageId: Schema.OptionFromNullOr(MessageId),
  /** The chat of `messageId`, set with it, so a chat's attachments are found without its messages. */
  chatId: Schema.OptionFromNullOr(ChatId),
  /** The attachment it was sent from, set only with `messageId`. */
  sourceId: Schema.OptionFromNullOr(AttachmentId),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtcFromDate,
}) {}

export const buildAttachment = (
  fields: Types.Simplify<
    Pick<Attachment, 'id' | 'userId' | 'fileName' | 'mediaType' | 'size' | 'createdAt'>
  >,
): Attachment =>
  new Attachment({
    ...fields,
    messageId: Option.none(),
    chatId: Option.none(),
    sourceId: Option.none(),
  })

/** The chat's record of the library attachment `source`, bound to `message`. */
export const buildAttachmentFrom = (
  source: Attachment,
  {
    message,
    ...fields
  }: Types.Simplify<
    Pick<Attachment, 'id' | 'createdAt'> & {
      readonly message: { readonly id: MessageId; readonly chatId: ChatId }
    }
  >,
): Attachment =>
  new Attachment({
    ...source,
    ...fields,
    messageId: Option.some(message.id),
    chatId: Option.some(message.chatId),
    sourceId: Option.some(source.id),
  })

/** The id its bytes are stored under: its source's, else its own. */
export const buildFileId = (attachment: Attachment): AttachmentId =>
  Option.getOrElse(attachment.sourceId, () => attachment.id)

const isUnbound: Predicate.Predicate<Attachment> = (attachment) =>
  Option.isNone(attachment.messageId)

/** Holds for an attachment of its user's library, which no chat holds. */
export const isInLibrary: Predicate.Predicate<Attachment> = (attachment) =>
  Option.isNone(attachment.chatId)

const isIn =
  (chatId: ChatId): Predicate.Predicate<Attachment> =>
  (attachment) =>
    Option.contains(attachment.chatId, chatId)

/** The value found for the attachment `id`; an absent one fails `AttachmentNotFoundError` naming `id`. */
export const ensureFound = (id: AttachmentId) =>
  Effect.fromOption(() => new AttachmentNotFoundError({ ids: [id] }))

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

const isStoredIn =
  (stored: ReadonlyArray<AttachmentId>): Predicate.Predicate<Attachment> =>
  (attachment) =>
    Arr.contains(stored, buildFileId(attachment))

/**
 * Keeps the attachments whose `buildFileId` is in `stored`, the ids whose bytes the object store
 * holds; fails `AttachmentNotFoundError` naming each id of `ids` left out, once, in the order
 * asked.
 */
export const ensureAllStored = (
  ids: ReadonlyArray<AttachmentId>,
  stored: ReadonlyArray<AttachmentId>,
) => flow(Arr.filter(isStoredIn(stored)), ensureAllFound(ids))

/**
 * The attachments when each is in the library or in the chat `chatId`; else
 * `AttachmentNotFoundError` naming each of another chat.
 */
export const ensureAllReachableFrom =
  (chatId: ChatId) => (attachments: ReadonlyArray<Attachment>) =>
    pipe(
      attachments,
      Arr.filter(Predicate.or(isInLibrary, isIn(chatId))),
      ensureAllFound(Arr.map(attachments, Struct.get('id'))),
    )

/** Fails `AttachmentBoundError` for an attachment a message holds. */
export const ensureUnbound = Effect.filterOrFail<Attachment, AttachmentBoundError>(
  isUnbound,
  (attachment) =>
    new AttachmentBoundError({ id: attachment.id, chatIds: Option.toArray(attachment.chatId) }),
)

/**
 * The attachment when `uses`, the records sent from it, are none; else `AttachmentBoundError`
 * naming their chats, each once.
 */
export const ensureUnused =
  (uses: ReadonlyArray<Attachment>) =>
  (attachment: Attachment): Effect.Effect<Attachment, AttachmentBoundError> =>
    Arr.match(uses, {
      onEmpty: () => Effect.succeed(attachment),
      onNonEmpty: (records) =>
        Effect.fail(
          new AttachmentBoundError({
            id: attachment.id,
            chatIds: pipe(records, Arr.map(Struct.get('chatId')), Arr.getSomes, Arr.dedupe),
          }),
        ),
    })

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
