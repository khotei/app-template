# packages

Generic, project-agnostic building blocks: `config`, the `db` / `storage` / `queue` / `llm`
clients, `api-client` and `ui`.

- **Never import a layer** (`domain`, `infrastructure`, `application`), an app or `deployment`.
  Packages may import each other.
- Clients take explicit options; only `@oblik/config` reads the environment
  (`.claude/rules/tooling.md › Environment`).
- `api-client` and `ui` ship to the browser: no Bun APIs, no `Bun.env`, no Node built-ins.
- A new package needs no Biome change. Follow the new-workspace checklist in
  `.claude/rules/tooling.md`.
