import { Array as Arr, Number as Num, Option, pipe, type Types } from 'effect'

import type { ChatContext } from '#chat/domain/chat.model'
import type { ContextMessage, Message } from '#chat/domain/message.model'
import type { RunUsage } from '#chat/domain/run.model'

/** A cut leaves this share of the limit, so the next cut is many replies away. */
const keepShare = 0.3

// Fixed, as a context's opening is part of the prefix the provider caches.
const summaryLead = 'Earlier messages of this conversation are not shown to you. A summary of them:'

/**
 * How a chat's context, what its reply sends the model, is counted, cut and sent. It counts no
 * token itself: the usage of the last done Run that wrote a message is spread over the messages
 * like their characters.
 */
export class ChatContextTokenizer {
  /** The tokens a context held at the reply `usage` counts: its prompt's with its reply's. */
  static readonly usageTokensSize = ({
    promptTokens,
    outputTokens,
  }: Types.Simplify<Pick<RunUsage, 'promptTokens' | 'outputTokens'>>): number =>
    promptTokens + outputTokens

  /**
   * The tokens the next prompt starts from, by the Run read with `message`: its prompt's with its
   * reply's. None for a message no done Run wrote.
   */
  static readonly tokensSize = ({ run }: Types.Simplify<Pick<Message, 'run'>>): number =>
    pipe(
      run,
      Option.flatMap(({ usage }) => usage),
      Option.match({
        onNone: () => 0,
        onSome: ChatContextTokenizer.usageTokensSize,
      }),
    )

  /**
   * The context `messages` split for its compaction, its size read from the last message a done
   * Run wrote, the last reply's, as the question after it holds none yet: `remain` are the
   * messages from the oldest whose tail holds at most `keepShare` of `tokensLimit`, the last
   * alone when no tail fits; `dropped` are those before it, for a summary. All remain, none
   * dropped, when the whole fits or no size is read.
   */
  static readonly splitToCompact = (
    messages: ReadonlyArray<Message>,
    tokensLimit: number,
  ): { readonly dropped: ReadonlyArray<Message>; readonly remain: ReadonlyArray<Message> } => {
    const tokensSize = pipe(
      messages,
      Arr.map(ChatContextTokenizer.tokensSize),
      Arr.findLast((size) => size > 0),
      Option.getOrElse(() => 0),
    )
    if (tokensSize === 0) return { dropped: [], remain: messages }

    const chars = Arr.map(messages, ({ text }) => text.length)
    const keptChars = (Num.sumAll(chars) * keepShare * tokensLimit) / tokensSize
    // tails[i]: the characters of messages[i] and of every message after it.
    const tails = Arr.scanRight(chars, 0, (tail, length) => tail + length)
    const last = messages.length - 1
    const head = pipe(
      Arr.findFirstIndex(tails, (tail) => tail <= keptChars),
      Option.match({ onNone: () => last, onSome: (index) => Math.min(index, last) }),
    )
    const [dropped, remain] = Arr.splitAt(messages, head)

    return { dropped, remain }
  }

  /**
   * `messages`, the chat's from where `context` starts, as they are sent: opened by a user's
   * message that holds the context's summary. The messages themselves while the chat holds no
   * context.
   */
  static readonly withContext = <M extends ContextMessage>(
    context: Option.Option<ChatContext>,
    messages: ReadonlyArray<M>,
  ): ReadonlyArray<M | ContextMessage> =>
    Option.match(context, {
      onNone: (): ReadonlyArray<M | ContextMessage> => messages,
      onSome: ({ compacted }) =>
        Arr.prepend(messages, { author: 'user', text: `${summaryLead}\n\n${compacted}` }),
    })
}
