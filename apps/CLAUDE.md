# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- A handler calls one domain service method or one use case and holds no rule
  (`.claude/rules/layering.md › Handlers`); `api/<entity>/<entity>.handler.ts` serves a contract
  group, `worker/<entity>/<object>.handler.ts` a queue.
- `main.ts` reads its `@app-template/config` services and starts the process. `api` and `worker`
  build everything else in `layer.ts`, exported as `./layer` for the journey in the root `e2e`
  workspace, so an app has no `e2e/` of its own; `ApiHttp` runs over the ports alone, so the
  api's unit suites provide the memory layers in place of the adapters.
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
- `api` may import every layer and every package; `worker` all but `http-api`, the HTTP contract.
- **`web` client code (`app/`, `features/`, `shared/`) imports only `@app-template/http-api` and
  `@app-template/ui` of our workspaces**, because it ships to the browser. Only the server
  entry `web/main.ts` may import `@app-template/config`, and never `http-api`.
