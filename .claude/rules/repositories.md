---
paths:
  - "kernel/data/**"
  - "application/*/services/**"
---

# Repositories: how they are asked, what they return and what the tables store

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
  of its own; a payload few callers need (an object's bytes) is one verb returning the entity
  extended with it (`Downloaded<Name>Entity`).
- A write returns `void` and dies where it misses a row it names: the caller checked the rule, so
  a miss is a lost race. An object store's writes are idempotent and never die on a missing
  object; a write that measures what it stores returns the measure.
- One shape per entity: a related entity is a field the same relational query fills, one level
  deep as the neighbour's `<Name>Columns`, and never becomes a second type
  (`<Name>EntityWith<Thing>`); an option never changes the return type. A model's insert and
  update variants, which a write encodes ([models.md](models.md)), are no second shape either.
- The filter lives in the `where`, a relation in the database (`ON DELETE CASCADE`), never in code
  after the read.

## A where's two forms

- A repository's `where` is Drizzle's filter object over its table, its key required (`Keyed`). No
  statement takes it bare: a relational query takes `buildFilter(where)`, a core-builder one
  `encodeFilter(<table>, where)`, so a filter that names nothing matches no row.
- A service's `where` is model values alone: a branded id, an `Option`, a list. Its key, and the
  owner on a user's call, are required fields; a narrowing the caller may leave out is
  `T | undefined` ([effect.md › Schemas](effect.md#schemas)). The method builds the repository's
  filter where it calls the repository, branching on such a narrowing and never passing its
  `where` through, so Drizzle's operators stay there and no filter holds an `undefined`. A method
  two callers reach with different fields takes a union of two named wheres, never one where of
  optional keys. The types and the alias of a relational query:
  [database.md › Repositories](../../docs/knowledge/database.md#repositories).

```diff
- orders.getOne({ id, note: { isNull: true } })             // the caller speaks Drizzle
+ orders.getOne({ id, note: Option.none() })
+ // OrderService.getOne, at its repository call:
+ repository.selectOne({ id, note: Option.getOrElse(note, () => ({ isNull: true })) })
- orders.list({ customerId, status: Option.fromUndefinedOr(query.status) })  // none is a null column
+ orders.list({ customerId, status: query.status })         // status: OrderStatus | undefined
+ // OrderService.list, at its repository call:
+ repository.selectMany({ customerId, ...(status === undefined ? {} : { status }) })
```

## What is stored

A value another table implies is a column the transactions that change it move, not derived on
each read; one a model function derives from the one row its read already nests stays derived
([decision](../../docs/knowledge/decisions.md#status-from-the-newest-run)).
