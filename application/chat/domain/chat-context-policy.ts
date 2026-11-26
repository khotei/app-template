import type { Types } from 'effect'

import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import type { RunUsage } from '#chat/domain/run.model'

/** A context is cut once its tokens pass this share of the limit. */
const cutShare = 0.8

/** The checks of a chat's context, what its reply sends the model. */
export class ChatContextPolicy {
  /** Whether the context a reply of `usage` leaves is over its share of `tokensLimit`, so due a cut. */
  static readonly isOverLimit = (
    usage: Types.Simplify<Pick<RunUsage, 'promptTokens' | 'outputTokens'>>,
    tokensLimit: number,
  ): boolean => ChatContextTokenizer.tokensSize(usage) > cutShare * tokensLimit
}
