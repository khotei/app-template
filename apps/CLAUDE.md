# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `main.ts` reads its `@app-template/config` services and starts the process. `api` and `worker`
  build everything else in `layer.ts`, exported as `./layer` alone, which the journey in the root
  `e2e` workspace runs, so an app has no `e2e/` of its own; the api's layer runs over the ports
  alone, so its unit suites provide the memory layers in place of the adapters.
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
