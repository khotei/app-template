import { identity, Predicate, Schema, SchemaTransformation, String as Str } from 'effect'

import type { Attachment } from '#chat/domain/attachment.model'
import { MessageFields } from '#chat/domain/message.model'
import { isBlank } from '#chat/domain/message.util'

/** Decoding drops the U+0000 a message's `text` refuses, as a reply is not refused for it. */
export class AssistantReply extends Schema.Class<AssistantReply>('AssistantReply')({
  text: Schema.String.pipe(
    Schema.decodeTo(
      MessageFields.fields.text.check(
        Schema.makeFilter(Predicate.not(isBlank), {
          expected: 'a string with a non-whitespace character',
        }),
      ),
      SchemaTransformation.transform({ decode: Str.replaceAll('\u0000', ''), encode: identity }),
    ),
  ),
}) {}

export interface AttachmentBytes {
  readonly attachment: Attachment
  readonly bytes: Uint8Array
}

export interface HistoryMessage {
  readonly message: MessageFields
  readonly attachments: ReadonlyArray<AttachmentBytes>
}
