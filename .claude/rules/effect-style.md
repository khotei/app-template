---
paths:
  - "**/*.ts"
---

# Effect: style

The goal is code that reads top to bottom and extends by adding a row, not a branch.

## Signatures

- Up to two parameters stay positional (`prepareMessage(message, at)`). A third one, or a
  boolean, moves into one trailing object with named fields after the subject:
  `failMessage(message, { reason, cause, at })`.
- More than two stay positional only where the types tell them apart: a service `Shape` method
  whose leading parameters are branded ids (`rename(userId, chatId, title)`), and a combinator
  that takes functions (`ensureFound(found, holds, missing)`).
- A repository write takes what it writes, then where: the whole entity or an `<Entity>Set` of
  the fields it changes, then an `<Entity>Where` of the fields the stored row must still hold,
  both typed from the model (`chats.update({ updatedAt: at }, { id })`,
  `messages.update(generating, { stage: prepared.stage })`). They are values, not an options
  bag: the call reads as the SQL it runs.
- Destructure an object whose fields come from different things (`{ reason, cause, at }`: the
  failure and the clock) in the parameter list; keep one entity whole (`message`, a proof value)
  and read its fields through its name, so the reader sees whose field it is.

## Control flow

- Keep a generator flat: guard clauses, never a nested ternary.
- One `yield*` per statement: name the intermediate value instead of nesting a `yield*` in an
  argument, so a body reads top to bottom with every step in view.
- Separate the paragraphs of a body with one blank line: the services it reads, the reads, the
  checks, the writes, the result. A body of three statements or fewer stays unbroken.
- Read an `Option` through its combinators (`Option.filter`, `Option.match`, `Option.getOrElse`);
  touch `.value` only under a narrowing guard.
- Prefer `Arr` where it names what native code spells out: `Arr.append` over a spread,
  `Arr.filter` over `.filter`, `Arr.getSomes` over `flatMap(Option.toArray)`,
  `Arr.isReadonlyArrayEmpty` over `.length === 0`.
- Run an effect per element with `Effect.forEach` (`{ discard: true }` when nothing is returned);
  keep `for … of` around `yield*` for an early exit only.
- A check on an effect's result is `Effect.filterOrFail` with a named predicate; a predicate built
  from others uses `Predicate.and` / `Predicate.not`, not an inline `&&`.

## Composition

- Business logic (a service method, a use case, a transition: the domain's rules in sequence with
  named intermediates) is `Effect.gen` or `Effect.fn` with `yield*`, never `Effect.Do`; a one-step
  transformation is a combinator (`Effect.map`, `Effect.flatMap`). The plumbing around it
  (encoding, error mapping, logging, retries, transactions, tracing, small helpers and adapters)
  is `pipe` / `.pipe` with combinators, on the effect or as `Effect.fn`'s pipeables
  (`effect-services.md › Functions`):
  `Effect.fn('<Service>.<method>')(function* (…) { … }, sql.withTransaction, Effect.mapError(…))`.
- `pipe` is the default way to compose, flat over nested: a value with `.pipe` (an `Effect`, a
  `Layer`, a `Schema`) through it, plain data (`Struct.keys(…)`) through `pipe(value, …)`; never
  both in one chain, no `pipe(…)` inside a pipe step. An inside-out body becomes a pipe with its
  steps in execution order, an effect pipeline ending in the combinator that runs it
  (`Effect.forkScoped`, `Layer.effectDiscard`), a chain without its value `flow(…)`. Use the
  data-last form and a named function point-free when its name says the step
  (`Effect.tap(Arr.match({ … }))`), a lambda only to add an argument or a name, and no point-free
  form that needs a cast or loses an `E` or `R`.
- A composable function takes its subject as the last, single argument, options first and curried
  (`pipe(message, encodeWith(codec))`); `dual` only when called both directly and as a pipe step.

## Branching

- When a rule varies by a key (a stage, a reason, a kind), write a lookup table
  `as const satisfies Record<Key, …>` and index it, never a predicate parameter or a chain of `if`s:
  a new key fails typecheck until its row exists (`transitions`, `failureMessages`). The row type
  of a table of effects names its `E` and `R` (a type alias when the union is long), never
  `unknown`: the table is where a reader learns what a row can fail with and needs.
- A closed union with three or more arms read in one place is a `Match`: `Match.typeTags` /
  `Match.valueTags` on `_tag`, `Match.discriminators('<field>')` on another discriminator, ending in
  `Match.exhaustive`. The cases: an error `_tag` to an HTTP status, a stream part by `type`, a stage
  to a view. Two arms stay a guard or `Option.match`.
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
