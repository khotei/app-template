import { describe, expect, test } from 'bun:test'

import { ExampleNameInvalidError } from '#domain/example/example.error'
import { buildExample } from '#domain/example/example.service'

describe('buildExample', () => {
  const now = new Date('2026-10-15T00:00:00.000Z')

  test('builds an example with a trimmed name and the given creation time', () => {
    const example = buildExample('  First  ', now)

    expect(example.name).toBe('First')
    expect(example.createdAt).toBe(now)
  })

  test('assigns a fresh UUID to every example', () => {
    const first = buildExample('First', now)
    const second = buildExample('Second', now)

    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(first.id).not.toBe(second.id)
  })

  test.each(['', '   '])('rejects the blank name %p', (name) => {
    expect(() => buildExample(name, now)).toThrow(ExampleNameInvalidError)
  })
})
