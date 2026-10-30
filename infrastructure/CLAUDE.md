# infrastructure

Adapters that implement the domain's ports on top of the generic `packages/*` clients, plus the
queue definitions, the outbox relay and the transaction.

- Each adapter is a `Layer` of a domain port, so callers never see the client: object keys and
  prompts stay inside the adapter.
- A `<entity>.queue.ts` holds only queue definitions; no adapter wraps `send` or `worker`.
- A repository runs on Postgres through `db/`, over the tables its `<entity>.entity.ts` declares
  ([database.md](../docs/knowledge/database.md)). Drizzle is reached only through Effect, never
  through a promise.
