---
paths:
  - "**/*.test.ts"
  - "**/testing/**"
---

# Effect: tests

## What to test

- Test our code: a rule, a query, a race, a rollback, a retry. Never test the framework or a
  library (Effect, Drizzle, vitest, the HTTP builder), AWS or MiniStack, what a type already
  guarantees, or test support itself (a fake, a harness, `PgClientTest`).
- Test a rule once, at the lowest seam that owns it: a pure domain function before a service, a
  service before a handler. A handler test checks only what HTTP adds: a status, a cookie, the
  shape on the wire.
- Never assert what the code leaves undefined, such as the order of rows with equal timestamps.

## Test support

- Test code is held to the bar of app code: a test composes the real layers and replaces what
  is external (the model, S3, a queue) with a plain layer over a `Map` or an array. A fake of our
  own port exists only to force a race or a failure the real one cannot produce on demand.
- A helper earns its place only when several tests get clearly longer without it. When a small
  problem appears (time, isolation, ordering), change the test or drop the minor assertion; never
  add a helper that patches another helper
  ([tooling.md › Tests](../../docs/knowledge/tooling.md#tests)).
- A test reads its services from the context (`yield* ChatService`) under a layer it provides
  (`Effect.provide(ChatTest)`), never through a callback runner.
- Test support that several test files share lives in `<workspace>/testing/` (or
  `packages/testing` when several workspaces share it, `@app-template/testing`, declared in
  `devDependencies`); tests stay colocated with their source. Roles: `naming.md › Files`.

## Resources and time

- Every test owns its resources: a database from `PgClientTest` (or `DbTest` over it), provided
  in the test, never cleaned up by hand. Tests in a file run concurrently; a suite whose tests
  share one resource opts out with `describe(name, { concurrent: false }, …)` (vitest 5 has no
  `describe.sequential`).
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
