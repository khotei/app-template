import { Schema, Struct } from 'effect'

import { Chat, ChatState, Message, Run } from '@app-template/application/chat/contract'

/** A chat with the state its newest Run gives it, in place of that Run. */
export const ApiChat = Chat.json
  .mapFields(Struct.assign({ state: ChatState.values }))
  .annotate({ identifier: 'ApiChat' })
export type ApiChat = typeof ApiChat.Type

// The json variants leave a Run's `failure` off: the provider's or SQS's text, which can hold
// request ids, key hints or the prompt, stays in the row.
export const ApiRun = Run.json.annotate({ identifier: 'ApiRun' })

export const ApiMessage = Message.json
  .mapFields(Struct.assign({ run: Schema.OptionFromNullOr(ApiRun) }))
  .annotate({ identifier: 'ApiMessage' })
