import { Layer } from 'effect'

import { CurrentReplyProvenance } from '#infrastructure/chat/assistant.llm'
import { ReplyProvenance } from '#infrastructure/chat/chat.queue'

/** The provenance every reply job carries under `CurrentReplyProvenanceTest`. */
export const replyProvenance = new ReplyProvenance({
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  instructionsHash: 'a1b2c3',
})

export const CurrentReplyProvenanceTest = Layer.succeed(CurrentReplyProvenance, replyProvenance)
