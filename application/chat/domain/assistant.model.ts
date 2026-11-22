import { identity, Schema, SchemaTransformation, String as Str } from 'effect'

import { MessageFields } from '#chat/domain/message.model'

/** Decoding drops the U+0000 a message's `text` refuses, as a reply is not refused for it. */
export class AssistantReply extends Schema.Class<AssistantReply>('AssistantReply')({
  text: Schema.String.pipe(
    Schema.decodeTo(
      MessageFields.fields.text,
      SchemaTransformation.transform({ decode: Str.replaceAll('\u0000', ''), encode: identity }),
    ),
  ),
}) {}
