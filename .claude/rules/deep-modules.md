---
paths:
  - "application/**"
  - "apps/**"
  - "kernel/**"
---

# Deep modules

A unit earns its place by a job of its own ([composition.md](composition.md)); its interface stays
deep: much behaviour behind few methods, argument and answer shapes, error modes.

## The tests

- Deletion: delete the module in thought. Nothing reappears in its callers, and it owns nothing
  they go through (a model's records, a seam) → a pass-through: delete it, its callers taking the
  unit below. Its job reappears in a caller, however few its callers and however short its body →
  it earns its place ([composition.md](composition.md)).
- Interface: a variation of a method's question is a value it already takes (a `where` field, a
  model field), never a new name; an operation the unit's job lacks is a method of it; another job
  is a new unit that wraps or composes it, never a method or an option stretched to hold it.
- Caller: what only tests use is no interface; delete it with its mapper, fake branch and test.

## A deep repository

```ts
// shallow: one method per question, answers the caller must decode
selectActiveByOwner(ownerId): Effect<Option<ActiveOrder>>
existsByOwner(ownerId): Effect<boolean>
update(set, id): Effect<boolean>
// deep: the question is data typed from the entity, a write that misses is a defect
selectOne(where: OrderEntityWhere): Effect<Option<OrderEntity>>
selectMany(where: OrderEntityWhere): Effect<ReadonlyArray<OrderEntity>>
update(set: OrderEntitySet, where: OrderEntityWhere): Effect<void>
```

- One method per verb over a `where` typed from the entity; reads that filter alike share one
  `where`, and a new filter is a field. A write finds its row by the key, never matching every
  row. A value a store derives per record (a signed URL) is a field its reads fill, never a verb
  of its own; a payload few callers need (an object's bytes) is one verb answering the entity
  extended with it (`Downloaded<Name>Entity`).
- A write answers `void` and dies where it misses a row it names: the caller checked the rule, so
  a miss is a lost race. An object store's writes are idempotent and never die on a missing
  object; a write that measures what it stores answers the measure.
- One shape per entity: a related entity is a field the same relational query fills, one level
  deep as the neighbour's `<Name>Columns`, and never becomes a second type
  (`<Name>EntityWith<Thing>`); an option never changes the answer's type. A model's
  `<Model>Fields` supertype, its own fields, which a write encodes and a neighbour may nest, is no
  second shape either.
- The filter lives in the `where`, a relation in the database (`ON DELETE CASCADE`), never in code
  after the read. The field mappers and a relational query's alias:
  [database.md › Repositories](../../docs/knowledge/database.md#repositories).

## Composition over pass-through

```ts
// OrderService.ship, the method a use case calls; `orders` is OrderRepository
const shipped = yield* shipOrder(order, at)              // the model moves it, names the refusal
yield* orders.update(shipped, { status: order.status })  // under the old state, or it dies
return shipped                                           // the value built: no re-read, no re-check
```

- A model function and the repository meet in the model's service: its method reads, calls the
  function and writes under the state it read, and a use case calls that method, never the
  repository. A model's status moves meet their write in `Move<Model>Service`, layered over
  `<Model>Service`; nothing else sits between a transition and its write. Two methods that
  differ by their `where`, `set` or step are one, taking them from the caller, with arguments as
  narrow as it uses.
- A copy per model is one function over the varying part (an id generator given the brand's
  `make`, an id's schema given its brand). A model's predicate and a value its service builds keep
  their names, however short or few their callers; the alias `effect-style.md › Composition`
  refuses is only a helper copied per variant (`sumRefunded` beside `sumTotal`), where each caller
  could pass its step in place.
- A value another table implies is a column the transactions that change it move, not derived on
  each read; one a model function derives from the one row its read already nests stays derived
  ([record](../../docs/knowledge/decisions.md#status-from-the-newest-run)).
- Plumbing is a pipeable, never `if (…) return yield* Effect.die(…)`; an import cycle is broken by
  widening a type, or, where two models nest each other's fields, by a `<name>-fields.model.ts`
  that both import.
