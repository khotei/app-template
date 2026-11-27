# packages

Generic, project-agnostic building blocks and their test support. A package knows no app: what
is this app's (its settings, its resources and their names, the pinned images) lives in
`kernel/`, and a package takes it as a parameter.

- A package the web client imports ships to the browser: no Bun APIs, no `Bun.env`, no Node
  built-ins.
- A file holds one role: a service or a group, with the types they take.
- Every exported function that is not a service is a static of a group, a class named for its
  meaning in `<package>-<what>.ts`, called `<Group>.<verb>`, a group of one member included; a
  static calls another by the class's name, never `this`
  ([models.md](../.claude/rules/models.md)), and a type stays a type beside its class. Except: a
  private helper one flow uses stays module-level beside it; test support (`packages/testing`, a
  `__tests__/testing/` folder) stays functions; a `Layer` constant keeps its
  `<Service><Variant>` name.
  ```diff
  - export const encodeOrderFilter = …; export const isOrderFilterEmpty = …  // one meaning, two names
  + export class OrderFilter { static readonly encode = …; static readonly isEmpty = … }
  ```
- Add a package: [tooling.md › Add a package](../docs/knowledge/tooling.md#add-a-package).
