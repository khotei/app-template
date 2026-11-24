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

- Our code: a rule, a query, a race, a rollback, a retry, an interrupt. Never the framework or a
  library (Effect, Drizzle, vitest, the HTTP builder), AWS or MiniStack, what a type guarantees, or
  test support itself (a fake, a test layer).
- A rule once, at the lowest seam that owns it: a pure domain function before a domain service,
  a domain service before a use case, a use case before a handler. A handler test checks only what
  its app adds: a status, a cookie, the shape on the wire.
- Never assert what the code leaves undefined, such as the order of rows with equal timestamps.

## Unit and e2e

- A unit test runs the real services and use cases over a `Layer.mock(<Name>Repository, { … })` of
  each repository, giving only the methods its flow may call (any other dies with
  `UnimplementedError`), and over the leaf services its module's test layer takes as an argument,
  each `Layer.mock(<Leaf>, {})` until a case passes its fake. It starts no container and asserts the
  row or the `set` and `where` a write was handed, never a read back. A use case's unit test checks
  the order of its steps and the jobs it sends, not the rules.
- Mock a leaf only, a repository or a leaf service (an assistant, the queue's sender): a layer
  that provides its own dependency ignores a double given from outside. What the database
  accepts, refuses, races or rolls back has its case on the repository's e2e or through the api,
  never a unit test: `TransactionTest` takes nothing back
  ([database.md › Tests](../../docs/knowledge/database.md#tests)).
- An e2e test proves an adapter on the e2e run's containers, or a flow through the api, never a call
  of the use case. Atomicity: the database refuses one write (a constraint the test adds) and no row
  and no job is kept. A race sends the rival requests with `Effect.all(…, { concurrency: 'unbounded'
  })` and asserts an outcome that holds whichever wins; a probe that removes the guard turns it red.
- An app's layer in a test's runtime ends in `Layer.fresh`
  (`repos/effect/migration/layer-memoization.md`): it then shares no layer with the test's own,
  builds its clients from its config, and keeps its writes in its own transaction.

## Test support

- Test code is held to the bar of app code: compose the real layers, double only what the seam
  leaves out. A helper earns its place only when several tests get clearly longer without it; a
  small problem (time, isolation, ordering) changes the test or drops the minor assertion.
- A test reads its services from the context (`yield* <Model>Service`) under a layer it provides
  (`Effect.provide(<Model>Test)`), never through a callback runner.

## Resources and time

- Every test owns its resources (a database from `PgClientTest` or `DbTest`, a stage from
  `AwsTest`), provided in the test, never cleaned up by hand. Tests in a file run concurrently; a
  suite sharing one resource opts out with `describe(name, { concurrent: false }, …)`.
- `it.effect`'s `TestClock` stands at 0, the fixtures' `epoch`. A test whose point is that time
  moves runs `it.live` and asserts relations (`child.createdAt >= parent.createdAt > epoch`), not
  instants. Move a `TestClock` only in a test about a delay or an expiry, never inside a shared
  `layer(…)` block.
- A model's new id cannot be pinned, as it is read past any `SecureRandom` layer: assert its form
  (`isUuidV7`) and build the expected record with it. `BunCrypto.layer` only under a service that
  yields a crypto service.

## Writing a test

- Use `@effect/vitest`: `it.effect`, `Effect.flip` to inspect a failure, its `assert`.
- Compare a failure whole with `assertSchemaEquals(<Model><Problem>Error, error, new
  <Model><Problem>Error({ … }))` from `@app-template/packages/testing` (`Schema.Array(<Class>)`
  for a list); a `Data.TaggedError`, which has no schema, by `assert.instanceOf` and its fields
  (`Struct.pick`). Never `Equal.equals` (`assertEquals`) on errors, which fails at random under
  Bun, nor `assert.deepStrictEqual`, which judges an `Error` by its message alone.
- A model fixture builds the model with `DateTime` values and ids as `<Model>Id.make('<uuid>')`;
  a test that decodes a model passes its row's values (`null`, a `Date`), since a model's
  encoded side is its row.
- The cases of one rule run with `it.each` over objects (a name template over `$field`),
  `it.effect.each` when a case is an effect, never a `for` loop around `it` or a lookup by key.
- A test of logging asserts the level with the message.
- Configuration comes from `ConfigProvider.fromUnknown({ … })`
  ([tooling.md › Environment](../../docs/knowledge/tooling.md#environment)).
