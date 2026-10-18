---
paths:
  - "**/*.ts"
---

# Effect

Imperatives for Effect 4 code in every layer, one file per concern:

| Rule | Covers |
|---|---|
| `effect-schema.md` | schemas, brands, models, failures |
| `effect-services.md` | effectful functions, services, layers |
| `effect-style.md` | combinators, control flow, lookup tables, pattern matching, equality |
| `effect-tests.md` | `@effect/vitest`, fixtures, assertions, suites over implementations |

- Check every API against the vendored `repos/effect` (start at `repos/effect/LLMS.md`), never
  against memory: `http-api`, `persistence` and `ai` are unstable and change between patches.
- Before writing a helper, a loop or a branch over an `Option`, an array, a `Cause`, a predicate or
  a string, look for it in effect's own modules (`Option`, `Array as Arr`, `Predicate`,
  `String as Str`, `Cause`, `Effect`, `Match`, `Equal`) and in the `ai-docs/src` examples next to
  `LLMS.md`.
- The shapes of domain models, ids, errors and ports are fixed in `domain/CLAUDE.md`.
