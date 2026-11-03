---
paths:
  - "**/__tests__/**"
  - "**/__e2e__/**"
  - "apps/e2e/**"
---

# Effect: tests

Where each kind of test and its support live, and what a test may import:
[tooling.md › Tests](../../docs/knowledge/tooling.md#tests).

## What to test

- Our code: a rule, a query, a race, a rollback, a retry. Never the framework or a library
  (Effect, Drizzle, vitest, the HTTP builder), AWS or MiniStack, what a type guarantees, or test
  support itself (a fake, a test layer).
- A rule once, at the lowest seam that owns it: a pure domain function before a domain service,
  a domain service before a use case, a use case before a handler. A handler test checks only what
  its app adds: a status, a cookie, the shape on the wire, the last attempt.
- Never assert what the code leaves undefined, such as the order of rows with equal timestamps.

## Unit and e2e

- A unit test runs the real services over the memory repositories and the memory layers of the
  ports, and starts no container. A use case's unit test checks the order of its steps and the
  jobs it sends, not the rules. A further fake only wraps a memory layer, to force a race or a
  failure it cannot produce on demand.
- A memory layer copies each guard the database adds, with its e2e twin on the repository, or a
  unit test passes on a write the database refuses:
  [database.md › Tests](../../docs/knowledge/database.md#tests).
- An e2e test proves an adapter on the run's containers, or a flow through the api, never a call
  of the use case. Atomicity: the database refuses one write (a constraint the test adds) and no
  row and no job is kept. A race sends the rival requests with `Effect.all(…, { concurrency:
  'unbounded' })` and asserts an outcome that holds whichever wins; a probe that removes the guard
  turns it red.
- Never put `DbTest` in one runtime with an app's layer: a layer is built once per runtime, so
  its `Db.layer` would serve both, and the app's writes would commit outside the test's
  transaction.

## Test support

- Test code is held to the bar of app code: compose the real layers, double only what the seam
  leaves out. A helper earns its place only when several tests get clearly longer without it; a
  small problem (time, isolation, ordering) changes the test or drops the minor assertion.
- A test reads its services from the context (`yield* <Model>Service`) under a layer it provides
  (`Effect.provide(<Model>Test)`), never through a callback runner.
- Every support file is `<name>.test-<role>.ts` and every test-only layer ends in `Test`, so
  `**/*.test-*.ts` and `\w+Test\b` find them all.

## Resources and time

- Every test owns its resources (a database from `PgClientTest` or `DbTest`, a stage from
  `AwsTest`), provided in the test, never cleaned up by hand. Tests in a file run concurrently; a
  suite sharing one resource opts out with `describe(name, { concurrent: false }, …)` (vitest 5
  has no `describe.sequential`).
- `it.effect`'s `TestClock` stands at 0, the fixtures' `epoch`. A test whose point is that time
  moves runs `it.live` and asserts relations (`child.createdAt == parent.updatedAt > epoch`), not
  instants. Move a `TestClock` only in a test about a delay or an expiry, never inside a shared
  `layer(…)` block.
- Generate ids with `BunCrypto.layer`; seed `TestCrypto` only for a test that asserts an id.

## Writing a test

- Use `@effect/vitest`: `it.effect`, `Effect.flip` to inspect a failure, its `assert`.
- Compare a failure whole with `assertSchemaEquals(<Model><Problem>Error, error, new
  <Model><Problem>Error({ … }))` from `@app-template/packages/testing` (`Schema.Array(<Class>)`
  for a list). Never `Equal.equals` (`assertEquals`) on errors, which fails at random under Bun,
  nor `assert.deepStrictEqual`, which judges an `Error` by its message alone.
- A model fixture passes `DateTime` values (`Schema.DateTimeUtc` decodes a `DateTime`, not an ISO
  string) and ids as `<Model>Id.make('<uuid>')`.
- The cases of one rule run with `it.effect.each` over objects (a name template over `$field`),
  never a `for` loop around `it` or a lookup by key.
- A test of logging asserts the level with the message.
- Configuration comes from `ConfigProvider.fromUnknown({ … })` (`tooling.md › Environment`).
