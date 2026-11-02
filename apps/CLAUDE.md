# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `main.ts` reads its `@app-template/kernel/config` services and starts the process. `api` and
  `worker` build everything else in `layer.ts`, which `main.ts` runs and no package exports:
  each app's `./testing` re-exports it (`ApiLayerTest`, `WorkerLayerTest`) for the journey in the
  `apps/__e2e__` workspace, so an app has no `__e2e__/` of its own; the api's layer runs over the
  repositories and ports alone, so its unit suites provide the memory layers in their place:
  [architecture.md › Where tests live](../docs/knowledge/architecture.md#where-tests-live).
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
  `apps/__e2e__` is not an app: it is the e2e workspace, no process of its own, and the one place
  that imports `api/testing` and `worker/testing`.
