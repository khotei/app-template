import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Option, Struct } from 'effect'

import type { ChatEntitySet, ChatEntityWhere, MessageEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'

import { Chat } from '#chat/domain/chat.model'
import { ChatContext } from '#chat/domain/chat-context.model'
import { Message } from '#chat/domain/message.model'
import { ContextChatService } from '#chat/services/context-chat.service'
import {
  assistantMessageAt,
  chat,
  chatUsage,
  owner,
  runUsage,
  userMessageAt,
} from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

const ofWhat = userMessageAt(3, 'Of what?')
const aCat = assistantMessageAt(4, 'A cat.')

/** `chat` after a reply, its context cut to start at `ofWhat`. */
const cut = new Chat({
  ...chat,
  usage: Option.some({
    ...chatUsage,
    context: { tokensSize: 135, startMessageId: Option.some(ofWhat.id) },
  }),
})

const where = { id: chat.id, userId: owner }

/** A store holding `stored` and `messages`, each read's where and each chat write kept. */
function storeContext(stored: Chat, messages: ReadonlyArray<Message>) {
  const reads: Array<MessageEntityWhere> = []
  const writes: Array<readonly [ChatEntitySet, ChatEntityWhere]> = []
  const layer = layerChatTest({
    chats: {
      selectOne: () => encodeWith(Chat)(stored).pipe(Effect.map(Option.some)),
      update: (...write) =>
        Effect.sync(() => {
          writes.push(write)
        }),
    },
    messages: {
      selectMany: (read) =>
        Effect.sync(() => {
          reads.push(read)
        }).pipe(
          Effect.andThen(Effect.forEach(messages, (message) => encodeWith(Message)(message))),
        ),
    },
  })
  return { reads, writes, layer }
}

describe('ContextChatService', () => {
  it.effect('getOne reads every message of a chat whose context starts at its first', () => {
    const { reads, layer } = storeContext(chat, [ofWhat, aCat])
    return Effect.gen(function* () {
      const contexts = yield* ContextChatService

      const context = yield* contexts.getOne(where)

      assertEquals(
        context,
        new ChatContext({ startMessageId: Option.none(), messages: [ofWhat, aCat] }),
      )
      assert.deepStrictEqual(reads, [{ chatId: chat.id }])
    }).pipe(Effect.provide(layer))
  })

  it.effect("getOne reads a cut chat's messages from the start its usage holds", () => {
    const { reads, layer } = storeContext(cut, [ofWhat, aCat])
    return Effect.gen(function* () {
      const contexts = yield* ContextChatService

      const context = yield* contexts.getOne(where)

      assertEquals(
        context,
        new ChatContext({ startMessageId: Option.some(ofWhat.id), messages: [ofWhat, aCat] }),
      )
      assert.deepStrictEqual(reads, [{ chatId: chat.id, id: { gte: ofWhat.id } }])
    }).pipe(Effect.provide(layer))
  })

  it.live("update adds the reply's usage to the chat's and stores where the context starts", () => {
    const { writes, layer } = storeContext(chat, [])
    return Effect.gen(function* () {
      const contexts = yield* ContextChatService

      yield* contexts.update(where, {
        context: new ChatContext({ startMessageId: Option.some(ofWhat.id), messages: [ofWhat] }),
        usage: runUsage,
      })

      assert.deepStrictEqual(
        writes.map(([set]) => set.usage),
        [
          {
            total: Struct.omit(runUsage, ['model']),
            context: { tokensSize: 135, startMessageId: ofWhat.id },
          },
        ],
      )
    }).pipe(Effect.provide(layer))
  })
})
