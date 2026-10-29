# application

Use cases: the flows that compose domain services with a transaction, the queue, the bucket or
the assistant. It holds no service of its own.

- May import `domain`, `infrastructure` and `packages/*`; never an app or `deployment`.
- When a flow is a use case, what it may write and how it commits: `.claude/rules/layering.md`.
- `testing/` holds the use cases' test layers, over the memory layers for the unit suites and over
  `DbTest` for the transaction's e2e suites, exported as `@app-template/application/testing` for
  the apps' suites too.
