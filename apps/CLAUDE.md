# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `src/main.ts` reads its `@app-template/config` services and starts the process.
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
- `api` may import every layer and every package; `worker` all but `http-api`, the HTTP contract.
- **`web` client code (`app/`, `features/`, `shared/`) imports only `@app-template/api-client`,
  `@app-template/http-api` and `@app-template/ui`**, because it ships to the browser. Only the
  server entry `web/src/main.ts` may also import `@app-template/config` and `effect`.
