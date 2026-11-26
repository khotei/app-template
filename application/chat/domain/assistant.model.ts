import { identity, Schema, SchemaTransformation, String as Str } from 'effect'

import { Message } from '#chat/domain/message.model'

/**
 * What a reply cost: the model that answered, the tokens of its prompt (`promptTokens`, of which
 * the cache served `cacheReadTokens` and stored `cacheWriteTokens`) and of its text.
 */
export const ReplyUsage = Schema.Struct({
  model: Schema.String,
  promptTokens: Schema.Int,
  outputTokens: Schema.Int,
  cacheReadTokens: Schema.Int,
  cacheWriteTokens: Schema.Int,
})
export type ReplyUsage = typeof ReplyUsage.Type

/** Decoding drops the U+0000 a message's `text` refuses, as a reply is not refused for it. */
export class AssistantReply extends Schema.Class<AssistantReply>('AssistantReply')({
  text: Schema.String.pipe(
    Schema.decodeTo(
      Message.fields.text,
      SchemaTransformation.transform({ decode: Str.replaceAll('\u0000', ''), encode: identity }),
    ),
  ),
  usage: ReplyUsage,
}) {}
