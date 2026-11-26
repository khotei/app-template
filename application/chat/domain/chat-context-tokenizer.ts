import { Array as Arr, Number as Num, Option, pipe, type Types } from 'effect'

import type { ChatAssistantContext } from '#chat/domain/chat.model'
import type { ContextMessage, Message } from '#chat/domain/message.model'
import type { RunUsage } from '#chat/domain/run.model'

/** A cut leaves this share of the limit, so the next cut is many replies away. */
const keepShare = 0.3

// Fixed, as a context's opening is part of the prefix the provider caches.
const summaryLead = 'Earlier messages of this conversation are not shown to you. A summary of them:'

/**
 * How a chat's context, what its reply sends the model, is counted, cut and sent. It counts no
 * token itself: a reply's usage is spread over the messages like their characters.
 */
export class ChatContextTokenizer {
  /** The tokens the next prompt starts from: the last prompt's with its reply's. */
  static readonly tokensSize = ({
    promptTokens,
    outputTokens,
  }: Types.Simplify<Pick<RunUsage, 'promptTokens' | 'outputTokens'>>): number =>
    promptTokens + outputTokens

  /**
   * `messages`, a context of `tokensSize`, compacted for the next reply: those from the oldest
   * user's whose tail holds at most `keepShare` of `tokensLimit`, or from the newest user's when
   * no tail fits; those before its first are what a summary takes. All of them when nothing can
   * go.
   */
  static readonly compact = <M extends Types.Simplify<Pick<Message, 'author' | 'text'>>>(
    messages: ReadonlyArray<M>,
    { tokensSize, tokensLimit }: { readonly tokensSize: number; readonly tokensLimit: number },
  ): ReadonlyArray<M> => {
    const chars = Arr.map(messages, ({ text }) => text.length)
    const keptChars = (Num.sumAll(chars) * keepShare * tokensLimit) / tokensSize
    // tails[i]: the characters of messages[i] and of every message after it.
    const tails = Arr.scanRight(chars, 0, (tail, length) => tail + length)

    return pipe(
      Arr.zip(messages, tails),
      Arr.findFirstIndex(([{ author }, tail]) => author === 'user' && tail <= keptChars),
      // No tail fits: the newest user's message, the least a reply needs.
      Option.orElse(() => Arr.findLastIndex(messages, ({ author }) => author === 'user')),
      Option.match({
        onNone: () => messages,
        onSome: (start) => Arr.drop(messages, start),
      }),
    )
  }

  /**
   * `messages`, the chat's after those `context` summarises, as they are sent: opened by a user's
   * message that holds the context's summary. The messages themselves while the chat holds no
   * context.
   */
  static readonly withContext = (
    context: Option.Option<ChatAssistantContext>,
    messages: ReadonlyArray<ContextMessage>,
  ): ReadonlyArray<ContextMessage> =>
    Option.match(context, {
      onNone: () => messages,
      onSome: ({ summary }) =>
        Arr.prepend(messages, { author: 'user', text: `${summaryLead}\n\n${summary}` }),
    })
}
