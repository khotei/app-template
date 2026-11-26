import { Array as Arr, Number as Num, Option, pipe, type Types } from 'effect'

import { ChatContext } from '#chat/domain/chat-context.model'
import type { RunUsage } from '#chat/domain/run.model'

/** A context is cut once its tokens pass this share of the limit, */
const cutShare = 0.8
/** down to this share, so the next cut is many replies away. */
const keepShare = 0.3

/** What a chat's context and the usage of its last reply say of the context its next reply sends. */
export class ChatContextState {
  /** The tokens the next prompt starts from: the last prompt's with its reply's. */
  static readonly tokensSize = ({
    promptTokens,
    outputTokens,
  }: Types.Simplify<Pick<RunUsage, 'promptTokens' | 'outputTokens'>>): number =>
    promptTokens + outputTokens

  /**
   * The context cut for the next reply: its messages from the oldest user's whose tail holds at
   * most `keepShare` of `tokensLimit`, the tokens taken as spread over the messages like their
   * characters. None while `tokensSize` fits `cutShare` of `tokensLimit`, and when no user's
   * message opens a tail that fits.
   */
  static readonly findContext = (
    { messages }: Types.Simplify<Pick<ChatContext, 'messages'>>,
    tokensSize: number,
    tokensLimit: number,
  ): Option.Option<ChatContext> => {
    if (tokensSize <= cutShare * tokensLimit) return Option.none()

    const chars = Arr.map(messages, ({ text }) => text.length)
    const keptChars = (Num.sumAll(chars) * keepShare * tokensLimit) / tokensSize
    // tails[i]: the characters of messages[i] and of every message after it.
    const tails = Arr.scanRight(chars, 0, (tail, length) => tail + length)

    return pipe(
      Arr.zip(messages, tails),
      Arr.findFirstIndex(([{ author }, tail]) => author === 'user' && tail <= keptChars),
      Option.map(
        (start) =>
          new ChatContext({
            startMessageId: pipe(
              messages,
              Arr.get(start),
              Option.map(({ id }) => id),
            ),
            messages: Arr.drop(messages, start),
          }),
      ),
    )
  }
}
