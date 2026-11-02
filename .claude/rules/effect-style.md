---
paths:
  - "**/*.ts"
---

# Effect: style

The goal is code that reads top to bottom and extends by adding a row, not a branch.

## Signatures

- Up to two parameters stay positional (`shipOrder(order, at)`). A third one, or a boolean,
  moves into one trailing object with named fields after the subject:
  `cancelOrder(order, { reason, cause, at })`.
- More than two stay positional only where the types tell them apart: a service `Shape` method
  whose leading parameters are branded ids (`placeOrder(userId, cartId, input)`).
- A repository write takes what it writes (the entity, or a `<Name>EntitySet` of the fields it
  changes), then a `<Name>EntityWhere` of the fields the stored row must still hold, both typed
  from the entity and passed as values, not an options bag, so the call reads as the SQL it runs:
  `orders.update({ updatedAt: at }, { id })`, `orders.update(shipped, { status: order.status })`.
- Destructure an object whose fields come from different things (`{ reason, cause, at }`) in the
  parameter list; keep a model or a proof value whole, so the reader sees whose field it is.
- A builder takes the fields it copies as one `Types.Simplify<Pick<<Model>, …>>` and spreads
  them, setting only its own (`new <Model>({ ...fields, status: 'new' })`), never naming each to
  pass it on: a `Schema.Class` drops the keys its schema lacks.

## Control flow

- Keep a generator flat: guard clauses, no nested ternary; one `yield*` per statement, value named.
- Separate the paragraphs of a body with one blank line: the services it reads, the reads, the
  checks, the writes, the result. A body of three statements or fewer stays unbroken.
- Read an `Option` by its combinators (`Option.match`); `.value` only under a narrowing guard.
- Prefer `Arr` where it names what native code spells out: `Arr.append` over a spread, `Arr.filter`
  over `.filter`, `Arr.getSomes` over `flatMap(Option.toArray)`, `Arr.isReadonlyArrayEmpty`.
- Run an effect per element with `Effect.forEach` (`{ discard: true }` when nothing is returned);
  keep `for … of` around `yield*` for an early exit only.
- A check on an effect's result is `Effect.filterOrFail` with a named predicate; a predicate built
  from others uses `Predicate.and` / `Predicate.not`, not an inline `&&`.

## Composition

- Business logic (a service method, a use case, a transition: later steps read several earlier
  values) is `Effect.gen` or `Effect.fn` with `yield*`, never `Effect.Do`; a one-step
  transformation is a combinator (`Effect.map`). The plumbing (encoding, error mapping, logging,
  retries, transactions, tracing) and small helpers and adapters are `pipe` / `.pipe`, chained on
  the step they serve, never wrapped around it, or `Effect.fn`'s pipeables (`effect-services.md ›
  Functions`): `Effect.fn('<Service>.<method>')(function* (…) { … }, transaction.run)`.
- A call never takes another call's result as its subject (`make nested-calls`):
  `Ref.get(rows).pipe(Effect.map(f))`, never `Effect.map(Ref.get(rows), f)`. A value with `.pipe`
  (an `Effect`, a `Layer`, a `Schema`, an `Option`) goes through it, plain data through
  `pipe(value, …)`; never both in one chain, no pipe inside a pipe step. A function whose every
  step feeds only the next is point-free: `flow(…)`, or an arrow whose body is one `.pipe` ending
  in the combinator that runs it (`Effect.forkScoped`). Go data-last when the function's name says
  the step (`Effect.tap(Arr.match({ … }))`), a lambda only to add an argument or a name, never a
  point-free form that needs a cast or loses an `E` or `R`.
- Reach a service by `Service.use((s) => s.m(…))`, or `useSync` for a plain value.
- A composable function takes its subject as the last, single argument, options first and curried
  (`pipe(message, encodeWith(codec))`); `dual` only when called both directly and as a pipe step.
- **Helpers that differ only by a step inside one frame are one function taking that step** (a
  predicate, a mapper): each caller passes its step in place, a library function or a lambda,
  never a named wrapper per variant. Such steps are open, any caller brings one; a rule varying
  by a key of a closed set stays a lookup table (› Branching).
```ts
// don't: a copy of the frame per field
const sumTotal = (xs: ReadonlyArray<Order>) => pipe(xs, Arr.map((o) => o.total), Num.sumAll)
const sumRefunded = (xs: ReadonlyArray<Order>) => pipe(xs, Arr.map((o) => o.refunded), Num.sumAll)
// do: one frame, the step passed where it is used
const sumBy = <A>(amount: (a: A) => number) => (xs: ReadonlyArray<A>) =>
  pipe(xs, Arr.map(amount), Num.sumAll)
pipe(orders, sumBy((order) => order.refunded))
```

## Branching

- When a rule varies by a key (a stage, a reason, a kind), index a lookup table
  `as const satisfies Record<Key, …>`, never a predicate parameter or a chain of `if`s: a new key
  fails typecheck until its row exists (a status's allowed sources, a reason's user message). A
  table of effects names its rows' `E` and `R` (an alias for a long union), never `unknown`: it
  names a row's needs.
- A closed union with three or more arms read in one place is a `Match` (`Match.typeTags` /
  `Match.valueTags` on `_tag`, `Match.discriminators('<field>')` otherwise) ending in
  `Match.exhaustive`: an error `_tag` to a status, a stream part by `type`. Two arms stay a guard.
- Pass a varying value as data (`Effect.logWithLevel(level)`), never choose between two functions.

## Errors and logs

- One job per combinator: log in `Effect.tapCauseIf` / `Effect.tapError`, recover in `catch*`,
  annotate in `Effect.annotateLogs`.
- Let an interrupt-only cause through with
  `Effect.catchCauseIf(Predicate.not(Cause.hasInterruptsOnly), …)`, paired with the `tapCauseIf`
  that logs every other cause. Inspect a `Cause` with `Cause.hasInterruptsOnly`, `hasDies`,
  `hasFails`, never by walking it; a ternary in `catchCause` only when the handler can fail.

## Equality

- Compare models and errors with `Equal.equals` (both are `Data`) for a "nothing changed" check
  before a write or a snapshot; a test compares errors by `assertSchemaEquals` (`effect-tests.md`).
