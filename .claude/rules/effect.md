---
paths:
  - "**/*.ts"
---

# Effect

Imperatives for Effect 4 code in every layer; one `effect-*.md` file per concern.

- Check every API against the vendored `repos/effect` (start at `repos/effect/LLMS.md`), never
  against memory: `http-api`, `persistence` and `ai` are unstable and change between patches.
  Check Drizzle's the same way, against `repos/drizzle/drizzle-orm/src`: the rc line changes
  between releases and `drizzle-orm/effect-postgres` is thinly documented.
- Before writing a helper, a loop or a branch over an `Option`, an array, a `Cause`, a predicate or
  a string, look for it in effect's own modules (`Option`, `Array as Arr`, `Predicate`,
  `String as Str`, `Cause`, `Effect`, `Match`, `Equal`) and in the `ai-docs/src` examples next to
  `LLMS.md`.
- Before writing a utility type, look for it in effect's `Types` module, then in `type-fest`.
