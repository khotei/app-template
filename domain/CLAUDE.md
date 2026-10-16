# domain

The pure core. It owns entity models, errors, ports (the interfaces that infrastructure implements)
and pure operations.

- **Imports no workspace at all**, not even `packages/*`. Biome rejects any `@oblik/*` import.
- **No I/O and no ambient state:** no `Bun.env`, no `fetch`, no `Date.now()`. Pass time in as an
  argument (`buildExample(name, now)`), so operations stay deterministic and testable.
- Errors extend `DomainError` and set `_tag` to the class name; apps map status codes from `_tag`,
  and the field is the seam for Effect's `Data.TaggedError`.
- Ports live in `<entity>.service.ts` next to the pure operations; they become Effect services
  later without moving files.
- Each entity folder exposes itself through `index.ts` (`@oblik/domain/<entity>`).
