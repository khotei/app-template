# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `main.ts` reads its `@app-template/kernel/config` services and starts the process. `api` and
  `worker` build everything else in `layer.ts`, which `main.ts` runs and no package exports,
  except the app's `./testing` for the e2e through the api; where those e2e and the apps' unit
  suites live and what they run on: [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
  `apps/__e2e__` is not an app: it is the e2e workspace, with no process of its own.
