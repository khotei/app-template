# http-api

The HTTP contract: one `HttpApi` (`api.ts`) over the domain, shared by `apps/api`, which
implements it, and the browser, which calls it through `ApiClient` (`api.client.ts`). A layer,
not a package: it is the system's boundary, specific to this app and used by two apps.

- **Imports only `effect` and `@app-template/domain`.** Biome rejects every other workspace and
  `@effect/*`.
- **Browser-safe:** no Bun APIs, no `Bun.env`, no Node built-ins.
- **Reuse the domain; never redeclare it.** Ids, models and errors come from `@app-template/domain`.
  A DTO (`mapFields`) only drops an internal field, turns an `Option` into `NullOr`, or composes
  domain models into the shape a service returns (a summary plus `activeMessage`, a message plus
  its `attachments`).
- **`index.ts` re-exports each domain schema a payload names** (`ChatTitle`): `web` may not import
  the domain, so it builds a payload's brand through this entry.
- **Statuses are set here, never in the domain:** `DomainError.pipe(HttpApiSchema.status(404))`
  where an endpoint or middleware lists the error. Only HTTP's own errors (`shared/errors.ts`)
  carry `httpApiStatus` on the class.
- **No handlers.** They are `apps/api/src/<entity>/<entity>.handler.ts`.
- Layout: `shared/` for what every group uses, one `<entity>/<entity>.http.ts` per group, no
  per-entity barrels.
- **Commit no spec file.** The spec is derived from `Api` at runtime, so a domain edit can change
  the wire unseen: the api's HTTP tests assert the wire shapes.
