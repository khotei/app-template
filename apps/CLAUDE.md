# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `src/main.ts` reads its `@app-template/config` services and starts the process.
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
- `api` and `worker` may import every layer and every package.
- **`web` client code (`app/`, `features/`, `shared/`) imports only `@app-template/api-client` and
  `@app-template/ui`**, because it ships to the browser. Only the server entry `web/src/main.ts`
  may also import `@app-template/config` and `effect`.
