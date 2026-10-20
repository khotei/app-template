# infrastructure

Adapters that implement domain ports on top of the generic `packages/*` clients: repositories,
storage keys, queue names, prompts.

- May import `domain` and `packages/*`; never `application`, an app or `deployment`.
- One adapter per role file (`<entity>.repository.ts`, `.storage.ts`, `.llm.ts`). Callers see an
  interface, never the client: a repository returns the domain port; a storage or LLM adapter owns
  its own interface, because the domain knows nothing about object keys or prompts.
- A `<entity>.queue.ts` holds only queue definitions; no adapter wraps `send` or `worker`.
- Until a real client exists, a repository or store runs on `KeyValueStore` through `kv/` and the
  LLM adapter on `packages/llm`'s stub. Replace the body, not the signature.
- This is where `Config` turns into client options: clients take explicit options and never read
  configuration themselves.
