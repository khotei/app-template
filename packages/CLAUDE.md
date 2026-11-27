# packages

Generic, project-agnostic building blocks and their test support. A package knows no app: what
is this app's (its settings, its resources and their names, the pinned images) lives in
`kernel/`, and a package takes it as a parameter.

- A package the web client imports ships to the browser: no Bun APIs, no `Bun.env`, no Node
  built-ins.
- A file holds one role: a service, a group, or a function alone, with the types they take.
- Functions of one meaning are statics of one class named for it, in `<package>-<what>.ts`, a
  static calling another by the class's name, never `this`
  ([models.md](../.claude/rules/models.md)); a function alone in its meaning stays a function,
  a type a type beside its class.
  ```diff
  - export const encodeOrderFilter = …; export const isOrderFilterEmpty = …  // one meaning, two names
  + export class OrderFilter { static readonly encode = …; static readonly isEmpty = … }
  ```
- Add a package: [tooling.md › Add a package](../docs/knowledge/tooling.md#add-a-package).
