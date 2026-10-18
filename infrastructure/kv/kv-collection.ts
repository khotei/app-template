import { Effect, Option, Schema, Semaphore } from 'effect'
import { KeyValueStore } from 'effect/persistence'

export interface Collection<A> {
  readonly get: (key: string) => Effect.Effect<Option.Option<A>>
  readonly set: (key: string, value: A) => Effect.Effect<void>
  /** Creates the key when it is missing. */
  readonly modify: (key: string, f: (current: Option.Option<A>) => A) => Effect.Effect<A>
  readonly delete: (key: string) => Effect.Effect<void>
}

export interface Index<Id extends string> {
  readonly append: (key: string, id: Id) => Effect.Effect<void>
  readonly remove: (key: string, id: Id) => Effect.Effect<void>
  /** Lists the ids in insertion order; an unknown index is empty. */
  readonly list: (key: string) => Effect.Effect<ReadonlyArray<Id>>
  readonly delete: (key: string) => Effect.Effect<void>
}

// Every operation takes this lock: the file store writes non-atomically, `KeyValueStore.modify`
// is a get-then-set that skips a missing key, and a plain set must not race a modify. It is per
// process, so an index must only ever be written by one process.
const lock = Semaphore.makeUnsafe(1)

export const createCollection = <A>(
  store: KeyValueStore.KeyValueStore,
  options: { readonly prefix: string; readonly schema: Schema.ConstraintCodec<A, unknown> },
): Collection<A> => {
  const values = KeyValueStore.toSchemaStore(
    KeyValueStore.prefix(store, options.prefix),
    options.schema,
  )
  const get = (key: string) => Effect.orDie(values.get(key))
  const set = (key: string, value: A) => Effect.orDie(values.set(key, value))
  return {
    get: Effect.fn('Collection.get')(function* (key: string) {
      return yield* get(key)
    }, lock.withPermit),
    set: Effect.fn('Collection.set')(function* (key: string, value: A) {
      yield* set(key, value)
    }, lock.withPermit),
    modify: Effect.fn('Collection.modify')(function* (
      key: string,
      f: (current: Option.Option<A>) => A,
    ) {
      const next = f(yield* get(key))
      yield* set(key, next)
      return next
    }, lock.withPermit),
    delete: Effect.fn('Collection.delete')(function* (key: string) {
      yield* Effect.orDie(values.remove(key))
    }, lock.withPermit),
  }
}

export const createIndex = <Id extends string>(
  store: KeyValueStore.KeyValueStore,
  options: { readonly prefix: string; readonly id: Schema.ConstraintCodec<Id, unknown> },
): Index<Id> => {
  const lists = createCollection(store, {
    prefix: options.prefix,
    schema: Schema.Array(options.id),
  })
  const orEmpty = Option.getOrElse((): ReadonlyArray<Id> => [])
  return {
    append: Effect.fn('Index.append')(function* (key: string, id: Id) {
      yield* lists.modify(key, (ids) => [...orEmpty(ids), id])
    }),
    remove: Effect.fn('Index.remove')(function* (key: string, id: Id) {
      yield* lists.modify(key, (ids) => orEmpty(ids).filter((each) => each !== id))
    }),
    list: Effect.fn('Index.list')(function* (key: string) {
      return orEmpty(yield* lists.get(key))
    }),
    delete: Effect.fn('Index.delete')(function* (key: string) {
      yield* lists.delete(key)
    }),
  }
}
