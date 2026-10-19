# packages

Generic, project-agnostic building blocks: `config`, the `queue` and `llm` clients, `api-client`,
`ui`, and the test support `testing` (`.claude/rules/effect-tests.md`). Objects and rows use
effect's `KeyValueStore`, not a package of ours.

- **Never import a layer** (`domain`, `infrastructure`, `application`), an app or `deployment`.
  Packages may import each other.
- Clients take explicit options; only `@app-template/config` reads the environment
  (`.claude/rules/tooling.md › Environment`).
- `api-client` and `ui` ship to the browser: no Bun APIs, no `Bun.env`, no Node built-ins.
- A new package needs no change to the layer guards in `biome.json`; a package of test support
  needs one more (`docs/knowledge/tooling.md › Add a workspace`). Follow the new-workspace
  checklist in `.claude/rules/tooling.md`.
