---
paths:
  - "**/*.ts"
---

# Effect

This is Effect 4, not the Effect 3 you remember: check every API against the vendored
`repos/effect` (start at `repos/effect/LLMS.md`), never memory. Grep a name you remember in
`repos/effect/migration/v3-to-v4.md`; a changed concept has a guide in `repos/effect/migration/`,
schemas, the HTTP API and config a long one in `repos/effect/packages/effect/` (`SCHEMA.md`,
`HTTPAPI.md`, `CONFIG.md`). What is unstable, and what a release may break there:
`repos/effect/MIGRATION.md › Unstable Module System`. Check Drizzle the same way, against
`repos/drizzle/drizzle-orm/src`: its rc line changes between releases.

- Write with effect's modules. Code over a value uses the module named for its type (`Array as
  Arr`, `String as Str`, `Struct`, `DateTime`, …); a purpose on values uses the module named for the
  purpose: a condition `Predicate`, a check that narrows or maps `Filter`, three arms or more `Match`,
  sorting and extremes `Order`, sameness `Equivalence`, merging two `Combiner`, folding many
  `Reducer`, a nested update `Optic`, success or failure as data `Result`, text for a log
  `Formatter`, composing functions `Function`.
- Look one up in `repos/effect/packages/effect/src/<Module>.ts`: its first comment says what it
  covers, its exports list the functions, each with an example;
  `repos/effect/ai-docs/src/` shows them in use.
- Native code that signals a missing module: an accumulator in a loop or `reduce` (`Arr`,
  `Reducer`); a spread that appends (`Arr.append`) or rebuilds a nested object (`Struct`, `Optic`);
  filter then map (`Arr.filterMap`, `Filter`); `flatMap(Option.toArray)` (`Arr.getSomes`);
  `JSON.stringify` in a log (`Formatter`). A lone default stays a plain `??`, a `null` branch a
  ternary.
- Look for a utility type in effect's `Types` module, then in `type-fest`, before writing one.
- Wrap a type built from others (`Pick`, `Omit`, `Partial`, `RequireAtLeastOne`, an
  intersection) in `Types.Simplify`, so a hover shows its fields, not the recipe. An `interface …
  extends` and a generic helper's own mapped type over a type parameter need none.
- Read the signature of any other package's API in the installed version,
  `<workspace>/node_modules/<pkg>` (its `.d.ts` or `src`): the isolated linker leaves the root
  `node_modules` without it.
