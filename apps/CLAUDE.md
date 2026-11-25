# apps

Thin processes: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `main.ts` starts the process. `api` and `worker` build it in `layer.ts`, which `main.ts` runs
  and no package exports, except the app's `./testing` for the e2e through the api. `ApiHttp`
  provides, after `HttpRouter.serve`, the `application/` services the api's handlers and use cases
  read, each bringing those it is composed over: a handler group's provide never reaches what its
  handlers call. `ApiLayer` provides the transaction, the queue sender and the stores, which the api's
  tests replace under `ApiHttp`. The worker's `layer.ts` provides what its route's use cases
  read. Where those
  e2e and the apps' unit suites live and what they run on:
  [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
- **The web declares no workspace of the app but `packages`:** its client is generated from the
  API contract's OpenAPI snapshot, which it reads by path, and checked in; `make api-snapshot`
  rewrites both, never by hand.
- **An api group takes the domain's schemas as they are** (ids, checks, models, errors): every
  error gets its status where an endpoint or a middleware lists it (`HttpApiSchema.status`),
  never on its class, and a model goes on the wire whole or as its `<Model>.json`, which leaves
  out what the model keeps off the wire (a sensitive or select-only field), with `.mapFields(…)`
  where the wire adds or swaps a field, named by an `identifier`. Decision:
  [The API contract in the api](../docs/knowledge/decisions.md#the-api-contract-in-the-api).
- **`apps/e2e` is a test app, not a fourth process:** it starts nothing of its own, and its
  suites run the apps' layers in the test's runtime; what it may import:
  [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
