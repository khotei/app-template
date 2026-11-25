import { describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { ChatBusyError } from '#chat/domain/chat.model'
import { ChatId } from '#chat/domain/chat.util'
import { ChatPolicy } from '#chat/domain/chat-policy'

const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000002')

describe('ChatPolicy.ensureNotBusy', () => {
  it.effect('takes a chat no ask has reached', () => ChatPolicy.ensureNotBusy(Option.none()))

  it.effect.each([{ status: 'done' }, { status: 'failed' }] as const)(
    'takes a chat whose newest Run is $status',
    ({ status }) => ChatPolicy.ensureNotBusy(Option.some({ chatId, status })),
  )

  it.effect.each([{ status: 'queued' }, { status: 'generating' }] as const)(
    'refuses a chat whose newest Run is $status with ChatBusyError, the check passed as a value',
    ({ status }) =>
      Effect.gen(function* () {
        const error = yield* Effect.succeed(Option.some({ chatId, status })).pipe(
          Effect.flatMap(ChatPolicy.ensureNotBusy),
          Effect.flip,
        )

        assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chatId }))
      }),
  )
})
