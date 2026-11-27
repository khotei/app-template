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
- A write is one statement and opens no transaction: rows that commit together, one table's
  each, are a write per table that the service commits through `Transaction`'s `run`
  ([layering.md](layering.md#writes-and-sends-in-services-and-use-cases)), the one way to open a
  transaction ([decision](../../docs/knowledge/decisions.md#one-way-to-open-a-transaction)).
- One shape per entity: a related entity is a field the same relational query fills, one level
  deep as the neighbour's `<Name>Columns`, and never becomes a second type
  (`<Name>EntityWith<Thing>`); an option never changes the return type. A model's insert and
  update variants, which a write encodes ([models.md](models.md)), are no second shape either.
- The filter lives in the `where`, a relation in the database (`ON DELETE CASCADE`), never in code
  after the read.
- What a repository builds its statements from (the columns an update writes, a read's order and
  nesting, an entity built from a read) are statics of `<Name>Row` in the entity's file
  (`OrderRow.newestFirst`; `<Name>Object` over an object store); a table, a `pgEnum` and
  `<Name>Columns` stay exports, as drizzle-kit reads a module's exports alone.

## A where's two forms

- A repository's `where` is Drizzle's filter object over its table, its key required (`Keyed`). A
  relational query (`db.query.<table>`) takes it as it is; a core-builder statement (`update`,
  `delete`, a plain `select`) takes `DbFilter.encode(<table>, where)`, the one function over it.
- A service's `where` is model values alone, one plain type: a branded id, an `Option`, a list,
  a range; a field a caller asks any of the three ways is `WhereValue<T>`.
  Its key, and the owner on a type only a user's calls take, are required fields; a narrowing the
  caller may leave out is an absent key, `key?: T` ([effect.md › Schemas](effect.md#schemas)).
- A method hands its repository `encodeWhere(where)`, the one function over a service's where: an
  `Option` of none is `{ isNull: true }`, a list `{ in: […] }`, a range `{ from, to }` its
  bounds (`{ gte, lte }`, either left out), any other value itself. Every
  field becomes a condition, so a caller writes a where as a literal of its type's fields, never
  a record whole. No method writes a Drizzle operator, copies a field, picks a where's fields or
  tests which it holds. A read by either of two keys, as its repository's `Keyed` names them,
  takes a where per key. The types and the alias of a relational query:
  [database.md › Repositories](../../docs/knowledge/database.md#repositories).

```diff
- orders.getOne({ id, note: { isNull: true } })             // the caller speaks Drizzle
+ orders.getOne({ id, note: Option.none() })
- orders.getMany({ customerId, status: Option.fromUndefinedOr(query.status) })  // a null column
+ orders.getMany({ customerId, ...(query.status === undefined ? {} : { status: query.status }) })
- repository.selectOne({ id, note: Option.getOrElse(note, () => ({ isNull: true })) })
+ repository.selectOne(encodeWhere(where))
- orders.getOne(order)                                      // every field of the record a condition
+ orders.getOne({ id: order.id, customerId: order.customerId })
```

## What is stored

A value another table implies is a column the transactions that change it move, not derived on
each read; one a model function derives from the one row its read already nests stays derived
([decision](../../docs/knowledge/decisions.md#state-from-the-newest-run)).
