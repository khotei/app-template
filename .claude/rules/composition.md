---
paths:
  - "**/*.ts"
---

# Composition: wrap or compose

Every unit, a model's function, a domain service, a util or a use case, starts simple and keeps
the one job it was made for, one reason to change; the code grows by new units over it. Record:
[Composition: wrap or compose](../../docs/knowledge/decisions.md#composition-wrap-or-compose).

## Where a change goes

Ask in order; the first yes decides:

1. **A fix, or the unit's own job extended** (one more field of its model, one more `where`
   field of its read, one more row of its table, a method its job lacks, such as a guarded write
   of its records) → edit the unit.
2. **Every holder must get it, behind the same interface** (a guard each write passes, an
   audit, a retry) → **wrap**: a unit of the same interface around the old one, which stays as
   it is. A service's wrap is a `layer<Variant>` that reads the same tag below and provides it
   again, the spread forwarding what it leaves as is.
3. **A capability or rule only some callers need, over units of one model** → **compose**: a
   unit named for what it adds (`<Aspect><Model>Service`, `ensure<Combined>`), built from the old
   ones; a caller that needs only the old one keeps it.
4. **An order of calls over services of several models, or a request's transaction** → a use
   case; a request that starts jobs, its rules, writes and sends after their commit, → the
   `Ask<Model>Service` of the model asked, and the jobs' runs, their transactions included, → its
   `Reply<Model>Service` ([layering.md](layering.md#ports-and-domain-services)).

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
  of different jobs.
- What still goes: dead code; a pass-through that adds nothing and owns nothing its callers go
  through ([deep-modules.md › The tests](deep-modules.md#the-tests)), its callers taking the
  unit below; a copy per variant, which becomes one unit over the varying value (a model's
  predicate or a value its service builds is no copy, however short or few its callers). A
  deletion never moves a unit's added behaviour into the unit below.
- A fold or a merge is the owner's call: its proposal names the job each unit holds and where it
  lives after.
