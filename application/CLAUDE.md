# application

Services and use cases: the scenarios of the product.

- May import `domain`, `infrastructure` and `packages/*`; never an app or `deployment`.
- **Services never call each other; a service may enqueue through a `.job` producer. Use cases
  compose services.**
