# http-api

The HTTP contract: one `HttpApi` over the domain, shared by `apps/api`, which implements it, and
the browser, which calls it through its client.

- **Browser-safe:** no Bun APIs, no `Bun.env`, no Node built-ins.
- **An id the contract declares keeps the domain's brand name,** so a handler passes it to a
  service unchanged. A model's shape and a module's errors still come from the module's entry
  (`@app-template/application/<module>`), its contract or its `domain/`. A DTO is the model's
  `mapFields`: it only drops an internal field, turns an `Option` into `NullOr` or swaps a nested
  model for its DTO.
- **`index.ts` re-exports each domain schema a payload names**: `web` may not import the domain,
  so it builds a payload's brand through this entry.
- **Statuses are set here, never in the domain:** a contract's error class carries its status as
  `httpApiStatus`; an error class the domain owns gets it where an endpoint lists it,
  `<Model>NotFoundError.pipe(HttpApiSchema.status(404))`.
- **A domain schema edit is a contract edit.** DTOs reuse the domain's schemas, so the change
  reaches the wire past the api's handler tests, which check only what HTTP adds (statuses, the
  cookie, the wire shape); `make api-check` fails on it until `make api-snapshot` moves
  `openapi.json` with it.
