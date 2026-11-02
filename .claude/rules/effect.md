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
- **Write with effect's modules, found by name, not from memory.** Code over a value uses the
  module named for its type (`Array as Arr`, `String as Str`, `Struct`, `DateTime`, …); a job on
  values uses the module named for the job: a condition `Predicate`, a check that narrows or maps
  `Filter`, three arms or more `Match`, sorting and extremes `Order`, sameness `Equivalence`,
  merging two `Combiner`, folding many `Reducer`, a nested update `Optic`, success or failure as
  data `Result`, text for a log `Formatter`, composing functions `Function`.
- Look one up in `repos/effect/packages/effect/src/<Module>.ts`: its first comment says what it
  covers, `grep -n '^export' <file>` lists the functions, each with an example;
  `repos/effect/ai-docs/src/` shows them in use.
- Native code that signals a missing module: `=== undefined` or `??` on a value (`UndefinedOr`,
  `Option`); a comparator lambda in a sort (`Order`); an accumulator in a loop or `reduce`
  (`Arr`, `Reducer`); a spread that rebuilds a nested object (`Struct`, `Optic`); filter then map
  (`Arr.filterMap`, `Filter`); `JSON.stringify` in a log (`Formatter`).
- Before writing a utility type, look for it in effect's `Types` module, then in `type-fest`.
- **Wrap a type built from others in `Types.Simplify`** (a `Pick`, `Omit`, `Partial`,
  `RequireAtLeastOne` or an intersection, in an alias, a parameter or a return type), so a hover
  shows the fields it ends with, not the recipe. An `interface … extends` and a generic helper's
  own mapped type over a type parameter need none.
- Before calling an API of any other package, read its signature in the version installed:
  `<workspace>/node_modules/<pkg>` (its `.d.ts` or `src`), never from memory; the isolated
  linker leaves the root `node_modules` without it.
