# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `main.ts` starts the process. `api` and `worker` build it in `layer.ts`, which `main.ts` runs
  and no package exports, except the app's `./testing` for the e2e through the api. An api
  handler group provides the services and use cases it reads; the worker's `layer.ts` provides
  its route's use cases. Where those e2e and the apps' unit suites live and what they run on:
  [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
- **`apps/e2e` is a test app, not a fourth process:** it starts nothing of its own, and its
  suites run the apps' layers in the test's runtime; what it may import:
  [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
