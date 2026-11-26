import { Array as Arr, Number as Num, Option, pipe, type Types } from 'effect'

import type { ChatContextCut } from '#chat/domain/chat.model'
import type { ContextMessage, Message } from '#chat/domain/message.model'
import type { MessageId } from '#chat/domain/message.util'
import type { RunUsage } from '#chat/domain/run.model'

/** A cut leaves this share of the limit, so the next cut is many replies away. */
const keepShare = 0.3

// Both fixed, as a context's opening is part of the prefix the provider caches.
const cutNote = 'Earlier messages of this conversation are not shown to you.'
const summaryLead = `${cutNote} A summary of them, which may leave some out:`

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
   * The message a context of `messages` and `tokensSize` starts at once cut: the oldest user's
   * whose tail holds at most `keepShare` of `tokensLimit`, or the newest user's when no tail
   * fits. None when that is the first message, as nothing can go.
   */
  static readonly findStartMessageId = (
    messages: ReadonlyArray<Types.Simplify<Pick<Message, 'id' | 'author' | 'text'>>>,
    { tokensSize, tokensLimit }: { readonly tokensSize: number; readonly tokensLimit: number },
  ): Option.Option<MessageId> => {
    const chars = Arr.map(messages, ({ text }) => text.length)
    const keptChars = (Num.sumAll(chars) * keepShare * tokensLimit) / tokensSize
    // tails[i]: the characters of messages[i] and of every message after it.
    const tails = Arr.scanRight(chars, 0, (tail, length) => tail + length)

    return pipe(
      Arr.zip(messages, tails),
      Arr.findFirstIndex(([{ author }, tail]) => author === 'user' && tail <= keptChars),
      // No tail fits: the newest user's message, the least a reply needs.
      Option.orElse(() => Arr.findLastIndex(messages, ({ author }) => author === 'user')),
      Option.filter((start) => start > 0),
      Option.flatMap((start) => Arr.get(messages, start)),
      Option.map(({ id }) => id),
    )
  }

  /**
   * What is sent for `messages`, the chat's from where `cut` starts: the messages themselves
   * while the chat is uncut, else opened by a user's message that holds the cut's summary, or a
   * note that earlier messages are not shown when it has none.
   */
  static readonly build = (
    cut: Option.Option<ChatContextCut>,
    messages: ReadonlyArray<ContextMessage>,
  ): ReadonlyArray<ContextMessage> =>
    Option.match(cut, {
      onNone: () => messages,
      onSome: ({ summary }) =>
        Arr.prepend(messages, {
          author: 'user',
          text: Option.match(summary, {
            onNone: () => cutNote,
            onSome: (written) => `${summaryLead}\n\n${written}`,
          }),
        }),
    })
}
