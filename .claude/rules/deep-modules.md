---
paths:
  - "domain/**"
  - "application/**"
  - "apps/**"
  - "infrastructure/**"
---

# Deep modules

A module earns its place by depth: much behaviour behind a small interface, which is all a caller
must know (methods, argument and answer shapes, error modes). `git log -S <name>` finds why a
module was cut or kept.

## The tests

- **Deletion:** delete the module in thought. Nothing reappears in its callers → it was a
  pass-through: delete it. It reappears in several → it earns its place.
- **Interface:** before a new method, type, field or option, pass the variation as a value an
  existing one takes (a `where` field, a model field); a new name is the last resort.
- **Caller:** what only tests use is no interface; delete it with its mapper, fake branch and test.

## A deep port

```ts
// shallow: one method per question, answers that carry meaning the caller must decode
selectActiveByOwner(ownerId): Effect<Option<ActiveOrder>>
existsByOwner(ownerId): Effect<boolean>
update(set, id): Effect<boolean>
// deep: the question is data typed from the model, a write that misses is a defect
selectOne(where: OrderWhere): Effect<Option<Order>>
selectMany(where: OrderWhere, options?: { forUpdate?: boolean }): Effect<ReadonlyArray<Order>>
update(set: OrderSet, where: OrderWhere): Effect<void>
```

- A repository has one method per verb (`insert`, `update`, `selectOne`, `selectMany`,
  `delete`) over a `where` typed from the model (`Pick`, `Partial`, `RequireAtLeastOne`); reads
  that filter alike share one `where` type; a new filter is a field. A write finds its row by the
  key, from the written entity or a required `where` field, so it never matches every row.
- A write answers `void` and dies where it matches no row: the caller checked the rule, so a
  miss is a lost race; a `boolean`, rows or a domain error adds an error mode to every caller.
- One shape per entity: a related model is a field the same relational query fills, never a
  second type (`<Entity>Detail`, `<Entity>With<Thing>`); an option never changes the answer's type.
- The filter lives in the `where`, a relation in the database (`ON DELETE CASCADE`), never in code
  after the read.
- Adapters stay small through shared mappers from each `where` and set field to its column; a
  `where` inside a relational query is built on the table the query hands over, which it aliases.
- The memory fake is the port's second adapter: its methods share one matcher, never a copy each.

## Composition over pass-through

```ts
// the model function moves the value and names the refusal; the port writes it under the old state
const shipped = yield* shipOrder(order, at)               // fails OrderStatusInvalidError
yield* orders.update(shipped, { status: order.status })   // dies if another writer moved it
return shipped                                            // the value built, never a re-read
```

- No method sits between a model function and the port. A domain service keeps only the rules
  that need a read (an owner check, a cascade with its side effects).
- Two methods that differ by their `where` or `set` are one, taking them from the caller, with
  arguments as narrow as the fields it uses.
- A copy per entity is one function over the varying part: an id maker given the brand, one
  status vocabulary each entity picks a subset of, one status predicate built from a pick.
- After a write, answer the value the pure function built; never re-read it or re-check what the
  write's guard checked.
- A value another table implies is a column moved by transitions in the transactions that change
  it, not derived on each read.
- Plumbing is a pipeable, never `if (…) return yield* Effect.die(…)`; an import cycle is broken by
  widening a type (an error's field takes the shared vocabulary), never by a new file.

## After a removal

Grep the removed name, its types and its options in code, fakes, docs and `.claude/rules/`.
