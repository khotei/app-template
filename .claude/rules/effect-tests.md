---
paths:
  - "**/tests/**"
  - "**/e2e/**"
  - "**/testing/**"
---

# Effect: tests

## What to test

- Test our code: a rule, a query, a race, a rollback, a retry. Never test the framework or a
  library (Effect, Drizzle, vitest, the HTTP builder), AWS or MiniStack, what a type already
  guarantees, or test support itself (a fake, a test layer, `PgClientTest`).
- Test a rule once, at the lowest seam that owns it: a pure domain function before a domain
  service, a domain service before a use case, a use case before a handler. A handler test checks
  only what its app adds: a status, a cookie, the shape on the wire, the last attempt.
- Never assert what the code leaves undefined, such as the order of rows with equal timestamps.

## Unit and e2e

- **A unit test** (`tests/`) runs the real services over the memory layers of the ports
  (`@app-template/domain/testing`), with `TransactionTest`, `recordQueue()` and
  `recordAssistant()` where a use case needs them, and starts no container. A use case's unit
  test checks the order of its steps and the jobs it sends, not the rules. A further fake of a
  port only wraps a memory layer, to force a race or a failure it cannot produce on demand.
- **A memory layer copies the guards the database adds** (an index, a `where`, a cascade), each
  with its e2e twin on the Pg adapter, or a unit test passes on a write the database refuses.
- **An e2e test** (`e2e/`) proves an adapter or a use case's transaction on the run's
  containers, or the journey. Atomicity: the database refuses one write of the flow (a constraint
  the test adds), and no row and no outbox row is kept. A race runs the rival calls with
  `Effect.all(…, { concurrency: 'unbounded' })` on the real repositories and asserts an outcome
  that holds whichever call wins; a probe that removes the guard must turn it red.
- The harnesses are `DbTest`, `AwsTest` and `StandTest`
  ([tooling.md › Tests](../../docs/knowledge/tooling.md#tests)). Never put `DbTest` in one
  runtime with a layer that builds `Db.layerFromConfig`: a layer is built once per runtime, so
  its `Db` would serve both, bound to the test's client, and the app's writes would commit
  outside its transaction.

## Test support

- Test code is held to the bar of app code: a test composes the real layers and doubles only
  what the seam leaves out.
- A helper earns its place only when several tests get clearly longer without it. A small problem
  (time, isolation, ordering) changes the test or drops the minor assertion, never adds a helper
  that patches another ([tooling.md › Tests](../../docs/knowledge/tooling.md#tests)).
- A test reads its services from the context (`yield* ChatService`) under a layer it provides
  (`Effect.provide(ChatTest)`), never through a callback runner.
- Every support file is `<entity>.test-<role>.ts` and every test-only layer ends in `Test`, so
  `**/*.test-*.ts` and `\w+Test\b` find them all; where they live: `naming.md › Files`.

## Resources and time

- Every test owns its resources: a database from `PgClientTest` (or `DbTest` over it), a stage
  from `AwsTest`, provided in the test, never cleaned up by hand. Tests in a file run
  concurrently; a suite whose tests share one resource opts out with
  `describe(name, { concurrent: false }, …)` (vitest 5 has no `describe.sequential`).
- `it.effect` gives each test its own `TestClock`, standing at 0, which is the fixtures' `epoch`.
  A test whose point is that time moves (an `updatedAt` bump) runs `it.live` and asserts
  relations (`message.createdAt == chat.updatedAt > epoch`), not instants. Move a `TestClock`
  only in a test about a delay or an expiry, never inside a shared `layer(…)` block.
- Generate ids with `BunCrypto.layer`; seed `TestCrypto` only for a test that asserts an id.

## Writing a test

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
- Run the cases of one rule with `it.effect.each` over objects (a name template over `$field`),
  never a `for` loop around `it` or a lookup by key.
- When a test checks logging, assert the level with the message.
- Provide configuration with `ConfigProvider.fromUnknown({ … })` (`tooling.md › Environment`).
