# packages

Generic, project-agnostic building blocks and their test support. A package knows no app: what
is this app's (its settings, its resources and their names, the pinned images) lives in
`kernel/`, and a package takes it as a parameter.

- A package the web client imports ships to the browser: no Bun APIs, no `Bun.env`, no Node
  built-ins.
- Add a package with `docs/knowledge/tooling.md › Add a package`.
