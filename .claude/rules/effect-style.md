---
paths:
  - "**/*.ts"
---

# Effect: style

The goal is code that reads top to bottom and extends by adding a row, not a branch.

## Signatures

- Up to two parameters stay positional (`prepareMessage(message, at)`); a third one, or a boolean,
  moves into one trailing object with named fields after the subject:
  `failMessage(message, { reason, cause, at })`.
- More than two stay positional only where the types tell them apart: a service `Shape` method
  whose leading parameters are branded ids (`rename(userId, chatId, title)`), and a combinator
  that takes functions (`ensureFound(found, holds, missing)`).
- A repository write takes what it writes, then where: the whole entity or an `<Entity>Set`, then
  an `<Entity>Where` of the fields the stored row must still hold, both typed from the model
  (`chats.update({ updatedAt: at }, { id })`, `messages.update(generating, { stage })`): values,
  not an options bag, so the call reads as the SQL it runs.
- Destructure an object whose fields come from different things (`{ reason, cause, at }`: the
  failure and the clock) in the parameter list; keep one entity whole (`message`, a proof value),
  its fields read through its name, so the reader sees whose field it is.

## Control flow

- Write sequential logic as `Effect.gen` or `Effect.fn`, never `Effect.Do`; a one-step
  transformation is a combinator (`Effect.map`, `Effect.flatMap`).
- Keep a generator flat: guard clauses, never a nested ternary; one `yield*` per statement, its
  value named, so a body reads top to bottom with every step in view.
- Separate the paragraphs of a body with one blank line: the services it reads, the reads, the
  checks, the writes, the result. A body of three statements or fewer stays unbroken.
- Read an `Option` through its combinators (`Option.filter`, `Option.match`, `Option.getOrElse`);
  touch `.value` only under a narrowing guard.
- Prefer `Arr` where it names what native code spells out: `Arr.append` over a spread, `Arr.filter`
  over `.filter`, `Arr.getSomes` over `flatMap(Option.toArray)`, `Arr.isReadonlyArrayEmpty` over
  `.length === 0`.
- Run an effect per element with `Effect.forEach` (`{ discard: true }` when nothing is returned);
  keep `for … of` around `yield*` for an early exit only.
- A check on an effect's result is `Effect.filterOrFail` with a named predicate; a predicate built
  from others uses `Predicate.and` / `Predicate.not`, not an inline `&&`.

## Composition

- Write in a functional style: pure functions over data, effects composed with combinators;
  readability decides every choice below.
- Business logic (a service method, a use case, a transition: the domain's rules in sequence with
  named intermediates) is `Effect.gen` / `Effect.fn` with `yield*`; the plumbing around it
  (encoding, error mapping, logging, retries, transactions, tracing, small helpers and adapters)
  is `pipe` / `.pipe` with combinators, on the effect or as `Effect.fn`'s pipeables
  (`effect-services.md › Functions`): `Effect.fn('<Service>.<method>')(function* (…) { …named
  yield* steps… }, sql.withTransaction, Effect.mapError(…))`.
- `pipe` is the default way to compose: a value with a `.pipe` method (an `Effect`, a `Layer`, a
  `Schema`, a `Stream`) through it, plain data without one (an array, `Struct.keys(…)`) through
  `pipe(value, …)` from `effect`; never mix both in one chain or nest a pipe in a step that a
  further step can carry.
- Flat over nested: a body that would read inside-out is `pipe(value, …)`, its steps in execution
  order, ending in the combinator that runs it (`Effect.forkScoped`, `Layer.effectDiscard`); a
  reusable chain without its value is `flow(…)`.
- Inside a pipe use the data-last form, and pass a named function point-free when its name says
  the step (`Arr.map(rows, Struct.get('id'))`, `Effect.tap(Arr.match({ … }))`); a lambda stays
  only to add an argument or a name.
- A function meant for composition takes its subject as the last, single argument; fixed options
  come first, curried (`encodeWith(codec)(message)`); it becomes `dual` (`effect/Function`) only
  when it is called both directly and as a pipe step.
- Stop where composition hides types: no point-free form that needs a cast or loses an `E` or `R`.

## Branching

- When a rule varies by a key (a stage, a reason, a kind), write a lookup table `as const
  satisfies Record<Key, …>` and index it, never a predicate parameter or a chain of `if`s: a new
  key fails typecheck until its row exists (`transitions`, `failureMessages`). A table of effects
  names its row's `E` and `R` (a type alias when long), never `unknown`: the table is where a
  reader learns what a row can fail with and needs.
- A closed union with three or more arms read in one place is a `Match` (`Match.typeTags` /
  `Match.valueTags` on `_tag`, `Match.discriminators('<field>')` on another discriminator) ending
  in `Match.exhaustive`: an error `_tag` to an HTTP status, a stream part by `type`, a stage to a
  view. Two arms stay a guard or `Option.match`.
- Pass a varying value as data (`Effect.logWithLevel(level)`), never choose between two functions.

## Errors and logs

- One job per combinator: log in `Effect.tapCauseIf` / `Effect.tapError`, recover in `catch*`,
  annotate in `Effect.annotateLogs`.
- An interrupt-only cause is let through with
  `Effect.catchCauseIf(Predicate.not(Cause.hasInterruptsOnly), …)`, paired with the `tapCauseIf`
  that logs every other cause; keep a ternary in `catchCause` only when the handler itself can fail.
- A `Cause` is inspected with `Cause.hasInterruptsOnly`, `Cause.hasDies`, `Cause.hasFails`, never by
  walking it.

## Equality

- Compare models and errors with `Equal.equals` (`Schema.Class` and `Schema.TaggedError` are
  `Data`); use it for "nothing changed" checks before a write or a snapshot. A test compares
  errors with `assertSchemaEquals` instead (`effect-tests.md`).
