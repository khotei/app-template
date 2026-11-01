# infrastructure

Adapters that implement the domain's ports on top of the generic `packages/*` clients, plus the
queue definitions.

- Each adapter is a `Layer` of a domain port, so callers never see the client: the prompts stay
  inside the adapter.
- A `<entity>.queue.ts` holds only queue definitions; no adapter wraps `send` or `worker`.
