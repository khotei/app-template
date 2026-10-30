# packages

Generic, project-agnostic building blocks: `config`, the `queue`, `llm` and `s3` clients, `ui`,
and the test support `testing`. The exceptions hold this project's data: `aws` its resources (the
inventory, the naming rule, the provisioner), so every layer and `deployment` can read them, and
`config` the pinned images: MiniStack, which `deployment` and the tests both read, and Postgres,
for the tests.

- `ui` ships to the browser: no Bun APIs, no `Bun.env`, no Node built-ins.
- Add a package with `docs/knowledge/tooling.md › Add a workspace`.
