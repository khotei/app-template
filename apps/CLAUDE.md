# apps

Thin entry points: `api` (HTTP), `worker` (jobs) and `web` (browser UI plus its dev server).

- `src/main.ts` loads `Config` and starts the process; `src/layer.ts` is the composition root that
  wires infrastructure into application, and later becomes an Effect `Layer`.
- **Apps never import each other.** Shared code moves down into `application` or `packages/*`.
- `api` and `worker` may import every layer and every package.
- **`web` client code (`app/`, `features/`, `shared/`) imports only `@oblik/api-client` and
  `@oblik/ui`**, because it ships to the browser. Only the server entry `web/src/main.ts` may also
  import `@oblik/config`.
- `api` maps domain errors to HTTP statuses by `_tag`; unknown errors are rethrown, not swallowed.
- Dev modes: `api` and `web` run `--hot`, `worker` runs `--watch` (why: `.claude/rules/tooling.md`).
