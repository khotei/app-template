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
   field of its read, one more row of its table) → edit the unit.
2. **Every holder must get it, behind the same interface** (a guard each write passes, an
   audit, a retry) → **wrap**: a unit of the same interface around the old one, which stays as
   it is. A service's wrap is a `layer<Variant>` that reads the same tag below and provides it
   again, the spread forwarding what it leaves as is.
3. **A capability or rule only some callers need** → **compose**: a unit named for what it adds
   (`<Aspect><Model>Service`, `ensure<Combined>`), built from the old ones; a caller that needs
   only the old one keeps it.
4. **An order of calls over several services, a transaction or a job send** → a use case.

```ts
// a wrap: each holder of OrderService from this layer gets the audit; OrderService is unedited
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

## By kind

- **Model:** a rule is small pure pieces of one condition or step each; a new rule composes them
  (`Effect.succeed(order).pipe(ensureUnpaid, Effect.flatMap(ensureInStock(stock)))`), never a
  flag added to a piece for one caller.
- **Domain service:** `<Model>Service` starts as its model's records over the repository, coded
  through the model, with the model's rules on them. A job past that is a service composed over
  it, whose `layer` provides it; a service composes only services of its own model, and a flow
  over two models is a use case.
- **Util:** a variation inside its job is a value it takes; another job is a function over it.
- **Use case:** a function that composes services, ports and model rules and holds only its
  flow: the order of the calls, the transaction, the job sends, what it skips and logs. A read, a
  write or a rule a service or a model could own moves there; a step two use cases share lives
  once, as a service method or a function beside the use cases, and both call it.

## Minimal means inside each unit

- Less code in each unit and no dead code, never fewer units: a line count, a caller count or a
  count of names never folds a wrap or a composed unit into the one below, nor merges two units
  of different jobs.
- What still goes: dead code; a pass-through that adds nothing and stands in for nothing
  ([deep-modules.md › The tests](deep-modules.md#the-tests)), its callers taking the unit below;
  a copy per variant, which becomes one unit over the varying value. A deletion never moves a
  unit's added behaviour into the unit below.
- A fold or a merge is the owner's call: its proposal names the job each unit holds and where it
  lives after.
