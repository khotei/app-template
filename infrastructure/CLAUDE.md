# infrastructure

Adapters that implement the domain's ports on top of the generic `packages/*` clients:
repositories, the attachment bucket, the assistant, plus the queue definitions, the outbox relay
and `Transaction`.

- May import `domain` and `packages/*`; never `application`, an app or `deployment`.
- One adapter per role file (`<entity>.repository.ts`, `.bucket.ts`, `.llm.ts`), each a `Layer` of
  a domain port, so callers never see the client: object keys and prompts stay inside the adapter.
- A `<entity>.queue.ts` holds only queue definitions; no adapter wraps `send` or `worker`.
- A repository runs on Postgres through `db/`, over the tables its `<entity>.entity.ts` declares
  ([database.md](../docs/knowledge/database.md)). `AssistantLlm` runs on `packages/llm`'s stub
  until a real provider replaces its body, not its signature.
- `db/` holds the Postgres client (`Db`, a Drizzle database on `@effect/sql-pg`), `Transaction`,
  the relations every table shares (`relations.ts`) and the migrations. Drizzle is reached only
  through Effect, never through a promise.
- Test support lives in `testing/` (the e2e `globalSetup`, `AwsTest`) and `db/testing/` (`DbTest`,
  `TransactionTest`), exported together as `@app-template/infrastructure/testing`.
- This is where `Config` turns into client options: clients take explicit options and never read
  configuration themselves.
