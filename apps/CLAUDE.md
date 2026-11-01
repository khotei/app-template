# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `main.ts` reads its `@app-template/kernel/config` services and starts the process. `api` and
  `worker` build everything else in `layer.ts`, exported as `./layer` alone, which the journey in
  the `apps/__e2e__` workspace runs, so an app has no `__e2e__/` of its own; the api's layer runs
  over the ports alone, so its unit suites provide the memory layers in place of the adapters.
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
  `apps/__e2e__` is not an app: it is the e2e workspace, no process of its own, and the one place
  that imports `api/layer` and `worker/layer`.
