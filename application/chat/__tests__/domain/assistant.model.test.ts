import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'

import { AssistantReply } from '#chat/domain/assistant.model'

const decodeReply = Schema.decodeUnknownOption(AssistantReply)

describe('AssistantReply', () => {
  it.effect.each([{ text: 'Sure.' }, { text: ' Sure.\n' }])('accepts the text $text', ({ text }) =>
    Effect.sync(() => assert.isTrue(decodeReply({ text }).pipe(Option.isSome))),
  )

  it.effect.each([{ text: '' }, { text: ' \n\t ' }])('rejects the blank text $text', ({ text }) =>
    Effect.sync(() => assert.isTrue(decodeReply({ text }).pipe(Option.isNone))),
  )
})
