---
paths:
  - "application/**"
  - "apps/**"
  - "kernel/**"
---

# Deep modules

A module earns its place by depth: much behaviour behind a small interface (methods, argument and
answer shapes, error modes).

## The tests

- Deletion: delete the module in thought. Nothing reappears in its callers → a pass-through:
  delete it. It reappears in several → it earns its place.
- Interface: before a new method, type, field or option, pass the variation as a value an
  existing one takes (a `where` field, a model field); a new name is the last resort.
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
  row; a store whose answer has another shape (a signed URL) adds a verb for it alone.
- A write answers `void` and dies where it misses a row it names: the caller checked the rule, so
  a miss is a lost race. An object store's writes are idempotent and never die on a missing
  object; a write that measures what it stores answers the measure.
- One shape per entity: a related entity is a field the same relational query fills, never a
  second type (`<Name>EntityWith<Thing>`); an option never changes the answer's type.
- The filter lives in the `where`, a relation in the database (`ON DELETE CASCADE`), never in code
  after the read. The field mappers and a relational query's alias:
  [database.md › Repositories](../../docs/knowledge/database.md#repositories).
- The memory fake is the repository's second layer, over the same entities, its methods sharing
  one matcher.

## Composition over pass-through

```ts
const shipped = yield* shipOrder(order, at)              // the model moves it, names the refusal
yield* orders.update(shipped, { status: order.status })  // under the old state, or it dies
return shipped                                           // the value built: no re-read, no re-check
```

- No method sits between a model function and the repository. Two methods that differ by their
  `where` or `set` are one, taking them from the caller, with arguments as narrow as it uses.
- A copy per model is one function over the varying part (an id maker given the brand).
- A value another table implies is a column the transactions that change it move, not derived on
  each read.
- Plumbing is a pipeable, never `if (…) return yield* Effect.die(…)`; an import cycle is broken by
  widening a type, never by a new file.
