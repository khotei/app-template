---
paths:
  - "**/*.ts"
---

# Effect

Imperatives for Effect 4 code in every layer. Check every API against the vendored `repos/effect`
(start at `repos/effect/LLMS.md`), never against memory: `http-api`, `persistence` and `ai` are
unstable and change between patches. The shapes of domain models, ids, errors and ports are fixed
in `domain/CLAUDE.md`.

## Schemas

- Decode untrusted input with a schema, never with hand-written predicates.
- Put an invariant in the schema whenever a check can state it (`Schema.isTrimmed()`,
  `Schema.isPattern(…)`, a brand), so the constructor and every decode from
  the store enforce it.
- An absent value is an `Option` (`Schema.Option(…)` in a model), never `null` or `undefined`;
  `null` exists only in a wire DTO.
- A literal lookup table is `as const satisfies Record<Key, Value>`, so a new key fails typecheck.

## Failures

- Fail with `return yield* new <Entity><Problem>Error({ … })`; the `return` ends the branch for
  TypeScript.
- A refused operation is a typed failure: never a `throw` (a defect that reads as an infrastructure
  failure) and never an `Option.none` (no detail for the caller or the log).
- Not-found from storage is a value (`Option`, or an id left out of an array); the application turns
  it into the domain's `*NotFoundError`.
- A port declares no error channel: its adapter turns a store failure or a stored value that no
  longer decodes into a defect, since every caller handles both alike.

## Functions and services

- An effectful function is `Effect.fn('<name>')(function* (…) { … })`, named after its export; a
  service method is named `'<Service>.<method>'`.
- A pure builder that cannot fail returns the model itself, not an `Effect`.
- Add a `Context.Service` only when something varies: the implementation (memory, file, Postgres),
  a test double, or an injected dependency. A rule with one implementation and no dependency is a
  plain function.
- Key a service `'@app-template/<workspace>/<entity>/<Name>'`.
- A service with exactly one implementation carries it as `static readonly layer`, so callers
  provide `<Service>.layer`.

## Tests

- Write Effect tests with `@effect/vitest`: `it.effect` for an effect, `Effect.flip` to inspect a
  failure, `assert` from the same package.
- A model fixture passes `DateTime` values: `Schema.DateTimeUtc` decodes a `DateTime`, not an ISO
  string.
