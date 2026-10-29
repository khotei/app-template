# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- What a handler may call: `.claude/rules/layering.md › Handlers`.
- `main.ts` reads its `@app-template/config` services and starts the process. `api` and `worker`
  build everything else in `layer.ts` (`naming.md › Workspaces`), which the journey in the root
  `e2e` workspace runs, so an app has no `e2e/` of its own; `ApiHttp` runs over the ports alone,
  so the api's unit suites provide the memory layers in place of the adapters.
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
- `api` may import every layer and every package; `worker` all but `http-api`, the HTTP contract.
- **`web` client code (`app/`, `features/`, `shared/`) imports only `@app-template/http-api` and
  `@app-template/ui` of our workspaces**, because it ships to the browser. Only the server
  entry `web/main.ts` may import `@app-template/config`, and never `http-api`.
