import {
  Array as Arr,
  Effect,
  Option,
  type Predicate,
  pipe,
  Schema,
  Struct,
  type Types,
} from 'effect'

import { UserId } from '@app-template/application/identity'
import { mediaTypePattern, minFileSize, textPattern } from '@app-template/kernel/data'

import { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId, ensureAllFound } from '#chat/domain/attachment.util'
import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'

export const FileName = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isPattern(textPattern),
).pipe(Schema.brand('FileName'))
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
  messageId: Schema.OptionFromNullOr(MessageId).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  /** The chat of `messageId`, set with it, so a chat's attachments are found without its messages. */
  chatId: Schema.OptionFromNullOr(ChatId).pipe(Schema.withConstructorDefault(Effect.succeedNone)),
  /** The attachment it was sent from, set only with `messageId`. */
  sourceId: Schema.OptionFromNullOr(AttachmentId).pipe(
    Schema.withConstructorDefault(Effect.succeedNone),
  ),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtcFromDate,
}) {}

/**
 * The chat's copy of the library attachment `source`, sent with the message `messageId` of
 * `chatId`, keeping its source's `createdAt`, so a message answers its attachments in upload
 * order.
 */
export const copyAttachment = (
  source: Attachment,
  {
    id,
    chatId,
    messageId,
  }: Types.Simplify<
    Pick<Attachment, 'id'> & { readonly chatId: ChatId; readonly messageId: MessageId }
  >,
): Attachment =>
  new Attachment({
    ...source,
    id,
    messageId: Option.some(messageId),
    chatId: Option.some(chatId),
    sourceId: Option.some(source.id),
  })

/** The id its bytes are stored under: its source's, else its own. */
export const buildBytesId = (attachment: Attachment): AttachmentId =>
  Option.getOrElse(attachment.sourceId, () => attachment.id)

const isUnbound: Predicate.Predicate<Attachment> = (attachment) =>
  Option.isNone(attachment.messageId)

/** Holds for an attachment of its user's library, which no chat holds. */
export const isInLibrary: Predicate.Predicate<Attachment> = (attachment) =>
  Option.isNone(attachment.chatId)

/**
 * The attachments read for `ids` when each id has one; else `AttachmentNotFoundError` naming
 * each id that has none, in the order asked.
 */
export const ensureAllAttachmentsFound = (ids: ReadonlyArray<AttachmentId>) =>
  ensureAllFound(ids, (missing) => new AttachmentNotFoundError({ ids: missing }))

/** Fails `AttachmentBoundError` for an attachment a message holds. */
export const ensureUnbound = Effect.filterOrFail<Attachment, AttachmentBoundError>(
  isUnbound,
  (attachment) =>
    new AttachmentBoundError({ id: attachment.id, chatIds: Option.toArray(attachment.chatId) }),
)

/**
 * The attachment when `uses`, the copies sent from it, are none; else `AttachmentBoundError`
 * naming their chats, each once.
 */
export const ensureUnused =
  (uses: ReadonlyArray<Attachment>) =>
  (attachment: Attachment): Effect.Effect<Attachment, AttachmentBoundError> =>
    Arr.match(uses, {
      onEmpty: () => Effect.succeed(attachment),
      onNonEmpty: (copies) =>
        Effect.fail(
          new AttachmentBoundError({
            id: attachment.id,
            chatIds: pipe(copies, Arr.map(Struct.get('chatId')), Arr.getSomes, Arr.dedupe),
          }),
        ),
    })

/** Binds the unbound attachment to the message and its chat. */
export const bindAttachment = (
  attachment: Attachment,
  message: { readonly id: MessageId; readonly chatId: ChatId },
): Attachment =>
  new Attachment({
    ...attachment,
    messageId: Option.some(message.id),
    chatId: Option.some(message.chatId),
  })
