import { Number as Num, Option, Struct, type Types } from 'effect'

import type { ChatUsage } from '#chat/domain/chat.model'
import type { ChatContext } from '#chat/domain/chat-context.model'
import { ChatContextState } from '#chat/domain/chat-context-state'
import type { RunUsage } from '#chat/domain/run.model'

const Total = Struct.makeReducer<ChatUsage['total']>({
  promptTokens: Num.ReducerSum,
  outputTokens: Num.ReducerSum,
  cacheReadTokens: Num.ReducerSum,
  cacheWriteTokens: Num.ReducerSum,
})

/** What a chat's usage becomes as its replies end. */
export class ChatUsageState {
  /**
   * The chat's usage after a reply of the usage `reply`: its counts added to the total, none
   * read as no reply yet, and the context sized by that reply and starting where `context` does.
   */
  static readonly add = (
    usage: Option.Option<ChatUsage>,
    reply: RunUsage,
    { startMessageId }: Types.Simplify<Pick<ChatContext, 'startMessageId'>>,
  ): ChatUsage => ({
    total: Total.combine(
      Option.match(usage, { onNone: () => Total.initialValue, onSome: ({ total }) => total }),
      reply,
    ),
    context: { tokensSize: ChatContextState.tokensSize(reply), startMessageId },
  })
}
