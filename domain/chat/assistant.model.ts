import { Predicate, Schema } from 'effect'

import { isBlank } from '#domain/chat/message.model'

export class AssistantReply extends Schema.Class<AssistantReply>('AssistantReply')({
  text: Schema.String.check(
    Schema.makeFilter(Predicate.not(isBlank), {
      expected: 'a string with a non-whitespace character',
    }),
  ),
}) {}
