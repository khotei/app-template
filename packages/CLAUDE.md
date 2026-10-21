# packages

Generic, project-agnostic building blocks: `config`, the `queue` and `llm` clients, `ui`, and
the test support `testing` (`.claude/rules/effect-tests.md`). Objects and rows use
effect's `KeyValueStore`, not a package of ours.

- **Never import a layer** (`domain`, `http-api`, `infrastructure`, `application`), an app or
  `deployment`. Packages may import each other.
- Clients take explicit options; only `@app-template/config` reads the environment
  (`.claude/rules/tooling.md › Environment`).
- `ui` ships to the browser: no Bun APIs, no `Bun.env`, no Node built-ins.
- Add a package with `docs/knowledge/tooling.md › Add a workspace`.
