import { Schema } from 'effect'

import { messageAuthors } from '@app-template/kernel/data'

import { MessageId } from '#chat/domain/message.util'

export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  'MessageNotFoundError',
  { id: MessageId, author: Schema.OptionFromNullOr(Schema.Literals(messageAuthors)) },
) {}
