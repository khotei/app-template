---
paths:
  - "**/*.ts"
---

# Effect: style

Code reads top to bottom, grows by a row or a unit, not a branch ([composition.md](composition.md)).

## Signatures

- Up to two parameters stay positional (`shipOrder(order, carrier)`); a third, or a boolean, moves
  into one trailing object after the subject: `cancelOrder(order, { reason, cause, refund })`.
  More stay positional only where branded types tell them apart (`placeOrder(userId, cartId, input)`).
- A function takes the smallest whole value that holds what it reads (the nested record, not its
  holder) and nothing another argument holds; an options object is destructured where it is taken.
- A builder exists for a rule of its own, never to call `new <Model>(…)` alone, as a default is the
  schema's (`withConstructorDefault`); it spreads what it copies as one `Pick` and sets its own.

## Control flow

- A generator stays flat: guard clauses, no nested ternary, one `yield*` per step, its value named,
  never a lone `flatMap` piped on one. A blank line separates its paragraphs (the services it reads,
  the reads, the checks, the writes, the result); a body of at most three statements stays unbroken.
- An `Option` is read by its combinators; a generator may return early on `Option.isSome`/`isNone`.
- An effect per element is `Effect.forEach` (`{ discard: true }` when nothing is returned);
  `for … of` around `yield*` only for an early exit.
- A check on an effect's result is `Effect.filterOrFail` with a named predicate; a predicate built
  from others uses `Predicate.and` / `Predicate.not`, not an inline `&&`.

## Composition

- Business logic (later steps read several earlier values) is `Effect.gen` or `Effect.fn`, never
  `Effect.Do`; a one-step transformation is a combinator. Plumbing (encoding, error mapping,
  logging, retries, transactions, tracing) is piped onto the step it serves, or passed as
  `Effect.fn`'s pipeables (`effect-services.md › Functions`), never a function taking the step
  (`withRetry(step)`) nor a branch that dies (`if (…) return yield* Effect.die(…)`).
- A step used once stays in its flow, so the flow reads whole: statements in a generator, or a named
  function expression in the `pipe` or combinator that orders the steps, when its name says what a
  lambda would not (`pipe(rows, function dropStale(rows) { … })`). One used from two places is a
  declaration, or an arrow constant for one expression; so is a tail's recovery of several steps.
- A generator reads a service with `yield*`; outside one it is `Service.use((s) => s.m(…))`, or
  `useSync` for a plain value, never `Effect.flatMap` over it. A call never takes another call's
  result as its subject (`make lint` fails on both). A value with `.pipe` goes through it, plain
  data through `pipe(value, …)`, never both in one chain. A function whose every step feeds only
  the next is point-free (`flow(…)`, or an arrow whose body is one `.pipe`), never at the cost of
  a cast, an annotation or a lost `E` or `R`.
- A composable function takes its subject last and alone, options first and curried
  (`pipe(message, encodeWith(codec))`), when its partial call reads as a whole step
  (`Effect.tap(Arr.match({ … }))`); a model's transition, whose name needs its record, stays plain
  and takes a lambda; a lambda only adds an argument or a name. `dual` only when called both ways.
- Helpers that differ only by a step inside one frame (a predicate, a mapper) are one function
  taking that step, each caller passing its own in place, never a named alias per variant.
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

- A rule that varies by a key (a stage, a reason, a kind) indexes a table
  `as const satisfies Record<Key, …>`, never a predicate parameter or a chain of `if`s, so a new
  key fails typecheck until its row exists. A table of effects names its rows' `E` and `R`, never
  `unknown`. A varying value is data (`Effect.logWithLevel(level)`), not a choice of two functions.

## Errors and logs

- One purpose per combinator: log in `Effect.tapCauseIf` / `Effect.tapError`, passing the `Cause`
  (`Effect.logError('…', cause)`); recover in `catch*`; annotate in `Effect.annotateLogs`, the
  flow's ids once at its end.
- A flow's main path reads as if nothing fails: each failure is handled once, in a tail
  (`onError`, `catch*`) at the end of the smallest flow that owns it, the step whose failure it
  is, beside the logic it ends; never mid-flow, where the main path must branch around it.
- A "nothing changed" check before a write or a snapshot compares models with `Equal.equals`,
  and errors as tests do ([tooling.md › Tests](../../docs/knowledge/tooling.md#tests)).
