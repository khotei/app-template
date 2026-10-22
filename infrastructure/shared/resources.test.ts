import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Glob } from 'bun'

import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Duration, Option, Predicate, Record as Rec, String as Str } from 'effect'

import { resources } from '@app-template/aws'
import { unboundLifetime } from '@app-template/domain/attachment'

const workspace = resolve(fileURLToPath(import.meta.url), '../..')

const scanWorkspace = (pattern: string) =>
  Array.fromAsync(new Glob(pattern).scan({ cwd: workspace, absolute: true }))

const hasDefinitionKeys = Predicate.and(
  Predicate.hasProperty('name'),
  Predicate.and(Predicate.hasProperty('maxAttempts'), Predicate.hasProperty('schema')),
)

const isQueueDefinition = Predicate.compose(
  hasDefinitionKeys,
  Predicate.Struct({ name: Predicate.isString, maxAttempts: Predicate.isNumber }),
)

const loadDefinitions = async () => {
  const files = await scanWorkspace('**/*.queue.ts')
  const modules = await Promise.all(Arr.map(files, (file) => import(file)))
  return Arr.flatMap(modules, (module) => Arr.filter(Object.values(module), isQueueDefinition))
}

const isTest = Str.endsWith('.test.ts')
const isDependency = Str.includes('/node_modules/')
const isInfrastructureSource = Predicate.not(Predicate.or(isTest, isDependency))

const loadInfrastructureSources = async () => {
  const files = await scanWorkspace('**/*.ts')
  const sources = Arr.filter(files, isInfrastructureSource)
  return Promise.all(Arr.map(sources, (file) => Bun.file(file).text()))
}

const definitions = await loadDefinitions()
const infrastructureSources = await loadInfrastructureSources()
const inventory = Object.values(resources.queues)
const buckets = Arr.map(Rec.toEntries(resources.buckets), ([key, { name }]) => ({ key, name }))

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

describe('the inventory and the infrastructure sources agree', () => {
  it.each(buckets)(
    'inventory bucket $name is read by an infrastructure source',
    ({ key, name }) => {
      const address = new RegExp(String.raw`\bresources\.buckets\.${key}\b`)

      assert.isTrue(
        Arr.some(infrastructureSources, (source) => address.test(source)),
        `bucket '${name}' is addressed by no code: no infrastructure source reads ` +
          `resources.buckets.${key}`,
      )
    },
  )
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
