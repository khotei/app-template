# Commit messages

Every commit follows this format, so a later session can run `git log -p` and rebuild the context
without opening the ticket.

## Format

```
<gitmoji> <type>(<scope>): <Subject>

<body: what and why, wrapped at 72 chars>

Decision: <non-obvious choice: trade-off, rejected alternative, or downstream implication>

Refs: docs/tickets/<YYYY-MM-DD>_<slug>/
```

- **Subject:** imperative, capitalised, no trailing period, ≤ 50 characters after the prefix.
- **Gitmoji** as a `:code:` shortcode (`:sparkles:`), not the emoji character.
- **Scope:** the ticket slug (`monorepo-setup`), else the area (`api`, `domain`, `ci`, `tooling`).
- **Decision:** required whenever a choice is non-obvious; add one paragraph per decision.
- **Refs:** the ticket folder, as the last paragraph before any trailers.
- Never commit or amend a ticket step without the user's explicit approval (see `sdd.md`).

## Vocabulary

| Gitmoji | Type | Use |
|---|---|---|
| `:sparkles:` | `feat` | new behaviour |
| `:bug:` | `fix` | bug fix |
| `:recycle:` | `refactor` | restructuring without a behaviour change |
| `:white_check_mark:` | `test` | tests only |
| `:memo:` | `docs` | docs and rules |
| `:wrench:` | `chore` | configuration |
| `:hammer:` | `chore` | scripts, Makefile |
| `:rotating_light:` | `chore` | linter setup or lint fixes |
| `:construction_worker:` | `ci` | CI |
| `:lipstick:` | `feat` | UI and style |
| `:lock:` | `fix` | security |
| `:tada:` | `chore` | the initial commit only |
