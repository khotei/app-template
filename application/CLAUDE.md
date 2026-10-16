# application

Services and use cases: the scenarios of the product.

- May import `domain`, `infrastructure` and `packages/*`; never an app or `deployment`.
- **Prefer receiving ports as arguments** (`createExampleService({ repository })`) over importing
  an adapter. Tests then pass fakes built with `mock()` from `bun:test`. Importing
  `infrastructure` directly is allowed, but it makes a scenario untestable without that adapter.
- **Services never call each other; use cases compose services.**
- Take the clock as a dependency (`now: () => Date`), never `new Date()` inside a use case.
