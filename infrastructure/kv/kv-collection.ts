import { Array as Arr, Effect, Option, Schema, Semaphore } from 'effect'
import { KeyValueStore } from 'effect/persistence'

export interface Collection<A> {
  readonly get: (key: string) => Effect.Effect<Option.Option<A>>
  /** Reads the keys under one permit, in the order asked, leaving missing keys out. */
  readonly getMany: (keys: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<A>>
  readonly set: (key: string, value: A) => Effect.Effect<void>
  /** Creates the key when it is missing. */
  readonly modify: (key: string, f: (current: Option.Option<A>) => A) => Effect.Effect<A>
  /** Writes nothing and returns none when the key is missing. */
  readonly update: (key: string, f: (current: A) => A) => Effect.Effect<Option.Option<A>>
  readonly delete: (key: string) => Effect.Effect<void>
}

export interface Index<Id extends string> {
  readonly append: (key: string, id: Id) => Effect.Effect<void>
  readonly remove: (key: string, id: Id) => Effect.Effect<void>
  /** Lists the ids in insertion order; an unknown index is empty. */
  readonly list: (key: string) => Effect.Effect<ReadonlyArray<Id>>
  readonly delete: (key: string) => Effect.Effect<void>
}

export interface Blobs {
  readonly get: (key: string) => Effect.Effect<Option.Option<Uint8Array>>
  readonly set: (key: string, bytes: Uint8Array) => Effect.Effect<void>
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
    get: Effect.fn('Collection.get')(get, lock.withPermit),
    getMany: Effect.fn('Collection.getMany')(
      (keys: ReadonlyArray<string>) => Effect.map(Effect.forEach(keys, get), Arr.getSomes),
      lock.withPermit,
    ),
    set: Effect.fn('Collection.set')(set, lock.withPermit),
    modify: Effect.fn('Collection.modify')(function* (
      key: string,
      f: (current: Option.Option<A>) => A,
    ) {
      const current = yield* get(key)
      const next = f(current)
      yield* set(key, next)
      return next
    }, lock.withPermit),
    update: Effect.fn('Collection.update')(function* (key: string, f: (current: A) => A) {
      const current = yield* get(key)
      if (Option.isNone(current)) return Option.none()

      const next = f(current.value)
      yield* set(key, next)
      return Option.some(next)
    }, lock.withPermit),
    delete: Effect.fn('Collection.delete')(
      (key: string) => Effect.orDie(values.remove(key)),
      lock.withPermit,
    ),
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
  const orEmpty = Option.getOrElse(Arr.empty<Id>)
  return {
    append: Effect.fn('Index.append')((key: string, id: Id) =>
      lists.modify(key, (ids) => Arr.append(orEmpty(ids), id)),
    ),
    remove: Effect.fn('Index.remove')((key: string, id: Id) =>
      lists.modify(key, (ids) => Arr.filter(orEmpty(ids), (each) => each !== id)),
    ),
    list: Effect.fn('Index.list')((key: string) => Effect.map(lists.get(key), orEmpty)),
    delete: Effect.fn('Index.delete')(lists.delete),
  }
}

export const createBlobs = (
  store: KeyValueStore.KeyValueStore,
  options: { readonly prefix: string },
): Blobs => {
  const blobs = KeyValueStore.prefix(store, options.prefix)
  return {
    get: Effect.fn('Blobs.get')(
      (key: string) => Effect.map(Effect.orDie(blobs.getUint8Array(key)), Option.fromUndefinedOr),
      lock.withPermit,
    ),
    set: Effect.fn('Blobs.set')(
      (key: string, bytes: Uint8Array) => Effect.orDie(blobs.set(key, bytes)),
      lock.withPermit,
    ),
    delete: Effect.fn('Blobs.delete')(
      (key: string) => Effect.orDie(blobs.remove(key)),
      lock.withPermit,
    ),
  }
}
