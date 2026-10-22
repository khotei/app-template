import { assert, describe, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'

import { QueueClient, type QueueDefinition } from '#queue/queue'
import { QueueError } from '#queue/queue.transport'
import { recordQueue } from '#queue/testing/queue.fake'

const Ping = Schema.Struct({ id: Schema.String, text: Schema.NonEmptyString })

const pings = {
  name: 'pings',
  schema: Ping,
  maxAttempts: 3,
  retryDelay: () => '1 second',
  jobId: (ping) => ping.id,
} satisfies QueueDefinition<typeof Ping>

describe('recordQueue', () => {
  it.effect('records each sent job with its queue and job id', () => {
    const { sent, layer } = recordQueue()
    return Effect.gen(function* () {
      const queue = yield* QueueClient

      yield* queue.send(pings, { id: 'p1', text: 'hello' })

      assert.deepStrictEqual(sent, [
        { queue: 'pings', jobId: 'p1', job: { id: 'p1', text: 'hello' } },
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect('fails a job that does not encode, as the client does, and records nothing', () => {
    const { sent, layer } = recordQueue()
    return Effect.gen(function* () {
      const queue = yield* QueueClient

      const error = yield* Effect.flip(queue.send(pings, { id: 'p1', text: '' }))

      assert.instanceOf(error, QueueError)
      assert.deepStrictEqual(sent, [])
    }).pipe(Effect.provide(layer))
  })
})
