import { Array as Arr, Number as Num, Option, pipe, Schema, type Types } from 'effect'

import type { ChatAssistantContext } from '#chat/domain/chat.model'
import { type ContextMessage, Message } from '#chat/domain/message.model'
import type { MessageId } from '#chat/domain/message.util'

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
   * What a cut of the context `messages` leaves out and where it starts after, the context's size
   * read from its last message, the reply's: kept are the messages from the oldest user's whose
   * tail holds at most `keepShare` of `tokensLimit`, or from the newest user's when no tail fits;
   * `left` are those before it, for a summary. None when nothing can go, or no size is read.
   */
  static readonly cut = (
    messages: ReadonlyArray<Message | ContextMessage>,
    tokensLimit: number,
  ): Option.Option<{
    readonly left: ReadonlyArray<Message | ContextMessage>
    readonly startMessageId: MessageId
  }> => {
    const tokensSize = pipe(
      Arr.last(messages),
      Option.filter(Schema.is(Message)),
      Option.match({ onNone: () => 0, onSome: ChatContextTokenizer.tokensSize }),
    )
    if (tokensSize === 0) return Option.none()

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
      Option.flatMap((start) =>
        pipe(
          Arr.get(messages, start),
          Option.filter(Schema.is(Message)),
          Option.map(({ id }) => ({ left: Arr.take(messages, start), startMessageId: id })),
        ),
      ),
    )
  }

  /**
   * `messages`, the chat's from where `context` starts, as they are sent: opened by a user's
   * message that holds the context's summary. The messages themselves while the chat holds no
   * context.
   */
  static readonly withContext = <M extends ContextMessage>(
    context: Option.Option<ChatAssistantContext>,
    messages: ReadonlyArray<M>,
  ): ReadonlyArray<M | ContextMessage> =>
    Option.match(context, {
      onNone: (): ReadonlyArray<M | ContextMessage> => messages,
      onSome: ({ latestSummary }) =>
        Arr.prepend(messages, { author: 'user', text: `${summaryLead}\n\n${latestSummary}` }),
    })
}
