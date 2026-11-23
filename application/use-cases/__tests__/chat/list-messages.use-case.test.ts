import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import { type ChatFilter, ChatNotFoundError } from '@app-template/application/chat'
import { chat, layerChatTest, owner } from '@app-template/application/chat/testing'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { listMessages } from '#use-cases/chat/list-messages.use-case'

describe('listMessages', () => {
  it.effect('list of a chat the store finds none of for the user is ChatNotFoundError', () => {
    const wheres: Array<ChatFilter> = []
    return Effect.gen(function* () {
      const error = yield* listMessages(owner, chat.id).pipe(Effect.flip)

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
      assert.deepStrictEqual(wheres, [{ id: chat.id, userId: owner }])
    }).pipe(
      Effect.provide(
        layerChatTest({
          chats: {
            selectOne: (read) =>
              Effect.sync(() => {
                wheres.push(read)
              }).pipe(Effect.as(Option.none())),
          },
        }),
      ),
    )
  })
})
