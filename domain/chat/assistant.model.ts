import { Schema } from 'effect'

export class AssistantReply extends Schema.Class<AssistantReply>('AssistantReply')({
  text: Schema.String.check(
    Schema.isPattern(/\S/u, { expected: 'a string with a non-whitespace character' }),
  ),
}) {}
