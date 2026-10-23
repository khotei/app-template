# infrastructure

Adapters that implement domain ports on top of the generic `packages/*` clients: repositories,
storage keys, queue names, prompts.

- May import `domain` and `packages/*`; never `application`, an app or `deployment`.
- One adapter per role file (`<entity>.repository.ts`, `.storage.ts`, `.llm.ts`). Callers see an
  interface, never the client: a repository returns the domain port; a storage or LLM adapter owns
  its own interface, because the domain knows nothing about object keys or prompts.
- A `<entity>.queue.ts` holds only queue definitions; no adapter wraps `send` or `worker`.
- A repository runs on Postgres through `db/`, over the tables its `<entity>.entity.ts` declares
  ([database.md](../docs/knowledge/database.md)); until its Postgres layer exists it runs on
  `KeyValueStore` through `kv/`, and the LLM adapter on `packages/llm`'s stub. Replace the body,
  not the signature.
- `db/` holds the Postgres client (`Db`, a Drizzle database on `@effect/sql-pg`), the migrations
  and the tests' `globalSetup`; Drizzle is reached only through Effect, never through a promise.
- This is where `Config` turns into client options: clients take explicit options and never read
  configuration themselves.
