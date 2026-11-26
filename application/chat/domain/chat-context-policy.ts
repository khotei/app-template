/** A context is cut once its tokens pass this share of the limit. */
const cutShare = 0.8

/** The checks of a chat's context, what its reply sends the model. */
export class ChatContextPolicy {
  /** Whether a context of `tokensSize` is over its share of `tokensLimit`, so due a cut. */
  static readonly isOverLimit = (tokensSize: number, tokensLimit: number): boolean =>
    tokensSize > cutShare * tokensLimit
}
