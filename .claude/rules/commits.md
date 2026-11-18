# Commit messages

Every commit follows this format, so `git log -p` rebuilds the context without the ticket.

## Format

```
<gitmoji> <type>(<scope>): <Subject>

<body: what and why, wrapped at 72 chars>

Decision: <non-obvious choice: trade-off, rejected alternative, or downstream implication>

Refs: docs/tickets/<ticket folder>/
```

- **Subject:** imperative, capitalised, no trailing period, ≤ 50 characters past the prefix,
  round id and source; the gitmoji as its `:code:` shortcode, not the emoji character.
- **Scope:** the ticket slug (`monorepo-setup`), else the area (`api`, `domain`, `ci`, `tooling`).
- **Decision:** required whenever a choice is non-obvious; add one paragraph per decision.
- **Refs:** the ticket folder, the last paragraph before any trailers. When a ticket's commit may
  land: the commit gate in `sdd.md › Gates`.

## A commit's unit

- **One change a reader can judge alone, green under `make check`.** Independent parts of a step
  or task are separate commits; a part that cannot be green alone joins the one it needs.
- **The body says what and why.** A fact (a number, a behaviour, "X fails") is written only when a
  run showed it, naming the command and its result. A `Decision:` paragraph states the choice and
  its trade-off without a run, but a fact inside it follows the same rule. A doc or rule line the
  change makes false is fixed in the same commit.

## A ticket's rounds

A ticket's commit opens its subject with its round: `.claude/rules/rounds.md`, which loads with
the ticket's files.

## Vocabulary

Every other gitmoji: [sdd.md › Gitmoji](../../docs/knowledge/sdd.md#gitmoji); a row here wins over
a close upstream entry (`:fire:` over `:coffin:`, `:bug:` over `:adhesive_bandage:`).

| Gitmoji | Type | Use |
|---|---|---|
| `:sparkles:` | `feat` | new behaviour |
| `:bug:` | `fix` | bug fix |
| `:recycle:` | `refactor` | restructuring without a behaviour change |
| `:fire:` | `chore` | removing code or files |
| `:white_check_mark:` | `test` | tests only |
| `:memo:` | `docs` | docs and rules |
| `:wrench:` | `chore` | configuration |
| `:hammer:` | `chore` | scripts, Makefile |
| `:rotating_light:` | `chore` | linter setup or lint fixes |
| `:construction_worker:` | `ci` | CI |
| `:lipstick:` | `feat` | UI and style |
| `:lock:` | `fix` | security |
| `:tada:` | `chore` | the initial commit only |
| `:rewind:` | `revert` | a revert of a rejected round |
