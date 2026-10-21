---
paths:
  - "{domain,http-api,application,infrastructure,packages,apps,deployment}/**/*.test.ts"
  - "{domain,http-api,application,infrastructure,packages,apps,deployment}/**/testing/**"
---

# Effect: tests

- Write Effect tests with `@effect/vitest`: `it.effect` for an effect, `Effect.flip` to inspect a
  failure, `assert` from the same package.
- Compare a failure whole, with `assertSchemaEquals(<Entity><Problem>Error, error,
  new <Entity><Problem>Error({ … }))` from `@app-template/testing`: the schema is the expected
  error's own class (`Schema.Array(<Class>)` for a list). It compares encoded forms: Bun puts
  its own position keys on an `Error`, so `Equal.equals` (`assertEquals`) fails at random on two
  equal errors. Never `assert.deepStrictEqual` on an `Error`: chai judges it by its message alone,
  so two errors with different fields pass.
- A model fixture passes `DateTime` values: `Schema.DateTimeUtc` decodes a `DateTime`, not an ISO
  string. Ids in fixtures are `<Entity>Id.make('<uuid>')`.
- Run the cases of one rule with `it.effect.each` (a name template over `$field` or `%s`), never a
  `for` loop around `it`.
- Run one suite over every implementation of a port or store (`describe.each` over layers, or a
  `suite(name, layer)` function), and share one built layer per suite with
  `layer(…)((it) => …)`.
- Name a handler, a layer or a recorder that several tests use once at module level
  (`recordAttempts`, `layerOverStore`, `recordLogs`); a test body holds only its arrangement
  and its assertions.
- Test support that several test files share lives in `<workspace>/testing/` (or
  `packages/testing` when several workspaces share it, `@app-template/testing`, declared in
  `devDependencies`); tests stay colocated with their source. Roles: `naming.md › Files`.
- When a test checks logging, assert the level with the message.
- Provide configuration with `ConfigProvider.fromUnknown({ … })` (`tooling.md › Environment`).
