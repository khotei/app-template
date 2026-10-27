# infrastructure

Adapters that implement domain ports on top of the generic `packages/*` clients: repositories,
storage keys, queue names, prompts.

- May import `domain` and `packages/*`; never `application`, an app or `deployment`.
- One adapter per role file (`<entity>.repository.ts`, `.bucket.ts`, `.llm.ts`). Callers see an
  interface, never the client: a repository returns the domain port; a bucket or LLM adapter owns
  its own interface, because the domain knows nothing about object keys or prompts.
- A `<entity>.queue.ts` holds only queue definitions; no adapter wraps `send` or `worker`.
- A repository runs on Postgres through `db/`, over the tables its `<entity>.entity.ts` declares
  ([database.md](../docs/knowledge/database.md)). The LLM adapter runs on `packages/llm`'s stub
  until a real provider replaces its body, not its signature.
- `db/` holds the Postgres client (`Db`, a Drizzle database on `@effect/sql-pg`), the relations
  every table shares (`relations.ts`) and the migrations; the test support, the e2e `globalSetup`
  included, lives in `testing/`. Drizzle is reached only through Effect, never through a promise.
- This is where `Config` turns into client options: clients take explicit options and never read
  configuration themselves.
