import { Array as Arr, Number as Num, Option, pipe, type Types } from 'effect'

import type { ChatContext } from '#chat/domain/chat.model'
import type { ContextMessage, Message } from '#chat/domain/message.model'

/** A cut leaves this share of the limit, so the next cut is many replies away. */
const keepShare = 0.3

// Fixed, as a context's opening is part of the prefix the provider caches.
const summaryLead = 'Earlier messages of this conversation are not shown to you. A summary of them:'

/**
 * How a chat's context, what its reply sends the model, is counted, cut and sent. It counts no
 * token itself: the usage of the Run that wrote the last message is spread over the messages
 * like their characters.
 */
export class ChatContextTokenizer {
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
        onSome: ({ promptTokens, outputTokens }) => promptTokens + outputTokens,
      }),
    )

  /**
   * The context `messages` split for its compaction, its size read from its last message, the
   * reply's: `remain` are the messages from the oldest whose tail holds at most `keepShare` of
   * `tokensLimit`, the last alone when no tail fits; `dropped` are those before it, for a
   * summary. All remain, none dropped, when the whole fits or no size is read.
   */
  static readonly splitToCompact = (
    messages: ReadonlyArray<Message>,
    tokensLimit: number,
  ): { readonly dropped: ReadonlyArray<Message>; readonly remain: ReadonlyArray<Message> } => {
    const tokensSize = pipe(
      Arr.last(messages),
      Option.match({ onNone: () => 0, onSome: ChatContextTokenizer.tokensSize }),
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
