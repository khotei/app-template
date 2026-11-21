---
paths:
  - "**/*.ts"
---

# Composition: wrap or compose

Every unit, a model's function, a domain service, a util or a use case, starts simple and keeps
the one purpose it was made for, one reason to change ([name-and-body.md](name-and-body.md), 5,
measures it); the code grows by new units over it, and each interface stays deep: much
behaviour behind few methods, argument and return shapes, error modes.
Decision: [Composition: wrap or compose](../../docs/knowledge/decisions.md#composition-wrap-or-compose).

## Where a change goes

Ask in order; the first yes decides:

1. **A fix, or the unit's own purpose extended** (one more field of its model, one more `where`
   field of its read, one more row of its table, a method its purpose lacks, such as a guarded write
   of its records) → edit the unit.
2. **Every holder must get it, behind the same interface** (a guard each write passes, an
   audit, a retry) → **wrap**: a unit of the same interface around the old one, which stays as
   it is. A service's wrap is a `layer<Variant>` that reads the same tag below and provides it
   again, the spread forwarding what it leaves as is.
3. **A capability or rule only some callers need, over units of one model** → **compose**: a
   unit named for what it adds (`<Aspect><Model>Service`, `ensure<Combined>`), built from the old
   ones; a caller that needs only the old one keeps it.
4. **An order of calls over several models of one module, their transaction or their sends** →
   the module's `<Verb><Model>Service` ([its role](layering.md#ports-and-domain-services)); an
   order over modules, or what an entry adds, → a use case.

```ts
// a wrap, a static beside `layer`: each holder from this layer gets the audit; `make` is unedited
static readonly layerAudited = Layer.effect(
  this,
  Effect.gen(function* () {
    const inner = yield* OrderService
    const audit = yield* AuditLog
    const remove = Effect.fn('OrderService.delete')(function* (id: OrderId) {
      yield* inner.delete(id)
      yield* audit.record(id)
    })
    return OrderService.of({ ...inner, delete: remove })
  }),
).pipe(Layer.provide(this.layer))
```

## Minimal means inside each unit

- Less code in each unit and no dead code, never fewer units: a line count, a caller count or a
  count of names never folds a wrap or a composed unit into the one below, nor merges two units
  of different purposes.
- Deletion: delete the unit in thought. Its purpose reappears in a caller, however few its callers
  and however short its body → it earns its place. Nothing reappears, and it owns nothing its
  callers go through (a model's records, a seam) → a pass-through: delete it, its callers taking
  the unit below.
- Interface: a variation of a method's question is a value it already takes (a `where` field, a
  model field), never a new name; another purpose is a unit of its own (2 and 3 above), never a
  method or an option stretched to hold it.
- Caller: what only tests use is no interface; delete it with its mapper, fake branch and test.
- What still goes: dead code; a pass-through; a copy per variant, which becomes one unit over the
  varying value (a model's predicate or a value its service builds is no copy, however short or
  few its callers). A deletion never moves a unit's added behaviour into the unit below.
- A fold or a merge is the owner's call: its proposal names the purpose each unit holds and where it
  lives after.
