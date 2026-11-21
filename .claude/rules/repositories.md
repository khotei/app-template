---
paths:
  - "kernel/data/**"
  - "application/*/services/**"
  - "application/*/domain/**"
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
  (`<Name>EntityWith<Thing>`); an option never changes the return type. A model's
  `<Model>Fields` supertype, its own fields, which a write encodes and a neighbour may nest, is no
  second shape either.
- The filter lives in the `where`, a relation in the database (`ON DELETE CASCADE`), never in code
  after the read. The field mappers and a relational query's alias:
  [database.md › Repositories](../../docs/knowledge/database.md#repositories).

## What is stored

A value another table implies is a column the transactions that change it move, not derived on
each read; one a model function derives from the one row its read already nests stays derived
([record](../../docs/knowledge/decisions.md#status-from-the-newest-run)).
