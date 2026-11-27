# apps

Thin processes: `api` (HTTP), `worker` (queue messages) and `web` (browser UI plus its dev server).

- `main.ts` starts the process. `api` and `worker` build it in `layer.ts`, which `main.ts` runs
  and no package exports, except the app's `./testing` for the e2e through the api. `ApiHttp`
  provides, after `HttpRouter.serve`, the `application/` services the api's handlers read, so a
  use case a handler calls, which reads them per request, finds them too: a provide on a handler
  group reaches only what its builder yields. `ApiLayer` provides
  the transaction, the queue sender and the stores, which the api's tests replace under
  `ApiHttp`. The worker's `layer.ts` provides what its handlers read. Where those e2e
  and the apps' unit suites live and what they run on:
  [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
- **The web declares no workspace of the app but `packages`:** its client is generated from the
  API contract's OpenAPI snapshot, which it reads by path, and checked in; `make api-snapshot`
  rewrites both, never by hand.
- **The api implements the API contract, `@app-template/application/http-api`:** its handlers,
  its middlewares' layers (`<name>.layer.ts`, a constant per service) and its OpenAPI snapshot
  live here; a group, a wire shape or a middleware's definition goes into the contract
  ([application/CLAUDE.md](../application/CLAUDE.md)). Decision:
  [The API contract in the api](../docs/knowledge/decisions.md#the-api-contract-in-the-api).
- **`apps/e2e` is a test app, not a fourth process:** it starts nothing of its own, and its
  suites run the apps' layers in the test's runtime; what it may import:
  [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
