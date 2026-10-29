import { assert, describe, it } from '@effect/vitest'
import { Option, Schema } from 'effect'

import { buildChatTitle, ChatTitle, maxTitleLength } from '#domain/chat/chat.model'

describe('ChatTitle', () => {
  it.each(['Trip', 'a'.repeat(120)])('accepts %j', (title) => {
    assert.isTrue(Schema.is(ChatTitle)(title))
  })

  it.each(['', '  ', ' Trip', 'a'.repeat(121)])('rejects %j', (title) => {
    assert.isFalse(Schema.is(ChatTitle)(title))
  })
})

const filler = (length: number) => 'A'.repeat(length)

// The limit counts code units; each emoji is one grapheme, 😀 two code units and the joined
// family eight. Every text is 300 graphemes long.
const cuts = [
  {
    name: 'an emoji that fits',
    text: `${filler(maxTitleLength - 2)}😀${filler(300 - maxTitleLength + 1)}`,
    title: `${filler(maxTitleLength - 2)}😀`,
  },
  {
    name: 'an emoji across the limit',
    text: `${filler(maxTitleLength - 1)}😀${filler(300 - maxTitleLength)}`,
    title: filler(maxTitleLength - 1),
  },
  {
    name: 'a joined emoji across the limit',
    text: `${filler(maxTitleLength - 5)}👨‍👩‍👧${filler(300 - maxTitleLength + 4)}`,
    title: filler(maxTitleLength - 5),
  },
] as const

describe('buildChatTitle', () => {
  it.each(cuts)('cuts a 300-grapheme text at a whole grapheme with $name', ({ text, title }) => {
    assert.deepStrictEqual(buildChatTitle(text), Option.some(ChatTitle.make(title)))
  })

  it('trims before the cut and after it', () => {
    const text = `  ${filler(maxTitleLength - 1)} and more\n`
    assert.deepStrictEqual(
      buildChatTitle(text),
      Option.some(ChatTitle.make(filler(maxTitleLength - 1))),
    )
  })

  it.each(['', ' \n '])('refuses the blank text %j', (text) => {
    assert.isTrue(buildChatTitle(text).pipe(Option.isNone))
  })
})
