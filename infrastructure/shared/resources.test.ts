import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Glob } from 'bun'

import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Duration, Option, Predicate, type Schema } from 'effect'

import { resources } from '@app-template/aws'
import { unboundLifetime } from '@app-template/domain/attachment'
import type { QueueDefinition } from '@app-template/queue'

const workspace = resolve(fileURLToPath(import.meta.url), '../..')

const isQueueDefinition = (value: unknown): value is QueueDefinition<Schema.Top> =>
  Predicate.isReadonlyObject(value) &&
  Predicate.isString(value.name) &&
  Predicate.isNumber(value.maxAttempts) &&
  Predicate.hasProperty(value, 'schema')

const loadDefinitions = async (): Promise<ReadonlyArray<QueueDefinition<Schema.Top>>> => {
  const files = await Array.fromAsync(
    new Glob('**/*.queue.ts').scan({ cwd: workspace, absolute: true }),
  )
  const modules = await Promise.all(files.map((file) => import(file)))
  return Arr.flatMap(modules, (module) => Arr.filter(Object.values(module), isQueueDefinition))
}

const definitions = await loadDefinitions()
const inventory = Object.values(resources.queues)

describe('the inventory and the queue definitions agree', () => {
  it.each(definitions)(
    'definition $name takes name and maxAttempts from the inventory',
    (definition) => {
      const entry = Arr.findFirst(inventory, (queue) => queue.name === definition.name)
      const maxReceiveCount = Option.map(entry, (queue) => queue.maxReceiveCount)

      assert.isTrue(Option.isSome(entry), `queue '${definition.name}' is not in the inventory`)
      assert.strictEqual(
        Option.getOrUndefined(maxReceiveCount),
        definition.maxAttempts,
        `queue '${definition.name}': the inventory's maxReceiveCount differs from maxAttempts`,
      )
    },
  )

  it.each(inventory)('inventory queue $name has a definition', (queue) => {
    assert.isTrue(
      Arr.some(definitions, (definition) => definition.name === queue.name),
      `queue '${queue.name}' has no definition in infrastructure/**/*.queue.ts`,
    )
  })
})

describe('the inventory and the attachment lifetime agree', () => {
  it('the attachments bucket expires unbound objects no sooner than unboundLifetime', () => {
    const { unboundExpirationDays } = resources.buckets.attachments.lifecycle

    assert.isTrue(
      Duration.isGreaterThanOrEqualTo(Duration.days(unboundExpirationDays), unboundLifetime),
      `bucket 'attachments': unboundExpirationDays (${unboundExpirationDays}) is shorter than ` +
        `unboundLifetime (${Duration.format(unboundLifetime)})`,
    )
  })
})
