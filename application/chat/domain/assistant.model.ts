import { identity, Schema, SchemaTransformation, String as Str } from 'effect'

import { Message } from '#chat/domain/message.model'
import { RunUsage } from '#chat/domain/run.model'

/** Decoding drops the U+0000 a message's `text` refuses, as a reply is not refused for it. */
export class AssistantReply extends Schema.Class<AssistantReply>('AssistantReply')({
  text: Schema.String.pipe(
    Schema.decodeTo(
      Message.fields.text,
      SchemaTransformation.transform({ decode: Str.replaceAll('\u0000', ''), encode: identity }),
    ),
  ),
  usage: RunUsage,
}) {}
