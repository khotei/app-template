# http-api

The HTTP contract: one `HttpApi` (`index.ts`) over the domain, shared by `apps/api`, which
implements it, and the browser, which calls it. A layer, not a package: it is the system's
boundary, specific to this app and used by two apps.

- **Imports only `effect` and `@app-template/domain`.** Biome rejects every other workspace and
  `@effect/*`.
- **Browser-safe:** no Bun APIs, no `Bun.env`, no Node built-ins.
- **Reuse the domain; never redeclare it.** Ids, models and errors come from `@app-template/domain`.
  A DTO (`mapFields`) only drops an internal field or turns an `Option` into `NullOr`.
- **Statuses are set here, never in the domain:** `DomainError.pipe(HttpApiSchema.status(404))`
  where an endpoint or middleware lists the error. Only HTTP's own errors (`shared/errors.ts`)
  carry `httpApiStatus` on the class.
- **No handlers.** They are `apps/api/src/<entity>/<entity>.handler.ts`.
- Layout: `shared/` for what every group uses, one `<entity>/<entity>.http.ts` per group, no
  per-entity barrels.
- **Commit no spec file.** The spec is derived from `Api` at runtime, so a domain edit can change
  the wire unseen: the api's HTTP tests assert the wire shapes.
