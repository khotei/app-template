---
paths:
  - "**/*.ts"
---

# Effect: style

The goal is code that reads top to bottom and extends by adding a row, not a branch.

## Signatures

- A function with three or more parameters, or a boolean one, takes its subject first and the
  rest as one object, so the call site names what it passes: `move(message, { to, at, patch })`,
  `failMessage(message, { reason, cause, at })`, `new SendableChat({ chatId, input, opensChat,
  at })`. A two-parameter function stays positional (`prepareMessage(message, at)`).

## Control flow

- Write sequential logic as `Effect.gen` or `Effect.fn`, never `Effect.Do`; a one-step
  transformation is a combinator (`Effect.map`, `Effect.flatMap`).
- Keep a generator flat: guard clauses, never a nested ternary.
- One `yield*` per statement: name the intermediate value instead of nesting a `yield*` in an
  argument, so a body reads top to bottom with every step in view.
- Separate the paragraphs of a body with one blank line: the services it reads, the reads, the
  checks, the writes, the result. A body of three statements or fewer stays unbroken.
- A pipeline reads top to bottom and ends in the combinator that runs it (`Effect.forkScoped`,
  `Effect.forever`, `Layer.effectDiscard`).
- Read an `Option` through its combinators (`Option.filter`, `Option.match`, `Option.getOrElse`);
  touch `.value` only under a narrowing guard.
- Prefer `Arr` where it names what native code spells out: `Arr.append` over a spread,
  `Arr.filter` over `.filter`, `Arr.getSomes` over `flatMap(Option.toArray)`,
  `Arr.isReadonlyArrayEmpty` over `.length === 0`.
- Run an effect per element with `Effect.forEach` (`{ discard: true }` when nothing is returned);
  keep `for … of` around `yield*` for an early exit only.
- A check on an effect's result is `Effect.filterOrFail` with a named predicate; a predicate built
  from others uses `Predicate.and` / `Predicate.not`, not an inline `&&`.

## Branching

- When a rule varies by a key (a stage, a reason, a kind), write a lookup table
  `as const satisfies Record<Key, …>` and index it, never a predicate parameter or a chain of `if`s:
  a new key fails typecheck until its row exists (`transitions`, `failureMessages`).
- A closed union with three or more arms read in one place is a `Match`: `Match.typeTags` /
  `Match.valueTags` on `_tag`, `Match.discriminators('<field>')` on another discriminator, ending in
  `Match.exhaustive`. The cases: an error `_tag` to an HTTP status, a stream part by `type`, a stage
  to a view. Two arms stay a guard or `Option.match`.
- Pass a varying value as data (`Effect.logWithLevel(level)`), never choose between two functions.

## Errors and logs

- One job per combinator: log in `Effect.tapCauseIf` / `Effect.tapError`, recover in `catch*`,
  annotate in `Effect.annotateLogs`.
- `Effect.catchCause` keeps one ternary for an interrupt-only cause: `catchCauseIf` would leak the
  handler's error type, since types cannot tell a cause the predicate rejected holds interrupts only.
- A `Cause` is inspected with `Cause.hasInterruptsOnly`, `Cause.hasDies`, `Cause.hasFails`, never by
  walking it.

## Equality

- Compare models and errors with `Equal.equals` (`Schema.Class` and `Schema.TaggedError` are
  `Data`); use it for "nothing changed" checks before a write or a snapshot. A test compares
  errors with `assertSchemaEquals` instead (`effect-tests.md`).
