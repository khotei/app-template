# Commit messages

Every commit follows this format, so a later session can run `git log -p` and rebuild the context
without opening the ticket.

## Format

```
<gitmoji> <type>(<scope>): <Subject>

<body: what and why, wrapped at 72 chars>

Decision: <non-obvious choice: trade-off, rejected alternative, or downstream implication>

Refs: docs/tickets/<ticket folder>/
```

- **Subject:** imperative, capitalised, no trailing period, ≤ 50 characters, counted from after
  the prefix and, in a ticket, after the round id and its source too.
- **Gitmoji** as a `:code:` shortcode (`:sparkles:`), not the emoji character.
- **Scope:** the ticket slug (`monorepo-setup`), else the area (`api`, `domain`, `ci`, `tooling`).
- **Decision:** required whenever a choice is non-obvious; add one paragraph per decision.
- **Refs:** the ticket folder, as the last paragraph before any trailers.
- When a ticket's commit may land: the commit gate in `sdd.md › Gates`.

## A ticket's rounds

Every commit of a ticket opens its subject with its round, so `git log --oneline` shows where a
change belongs and who asked for it:

```text
:sparkles: feat(<slug>): St2 S4.1 Add the order parser
:bug: fix(<slug>): St2 S4.2 (REVIEW) Reject an empty order
:recycle: refactor(<slug>): St2 S5+S6 (STAGE) One order type for both
:rewind: revert(<slug>): St2 S5.3 (OWNER) Revert S5.2
:memo: docs(<slug>): St3 (PLAN) Prepare stage 3
```

- **The id:** `St<stage> S<step>.<round>`; a stage's preparation is `St<stage>` alone; a plan of
  the old form, without stages, drops the stage (`S4.2 (REVIEW)`).
- **The source**, in capitals, past the implementer's first pass: `REVIEW` the step's passes,
  `OWNER` the user's word or edit, `STAGE` the Stage review, `VERIFY` a verification, `PLAN` an
  edit of the plan alone (a stage's preparation, a step's close). The kind of change stays in the
  gitmoji and type.
- **A fix** carries the id of each step whose code it changes (`S5+S6`), and its body opens with
  `Fixes <the fixed round's id>: <what was wrong>`; never a hash, stale after a cherry-pick.
- **A revert's** subject names the round it reverts.
- **A step's rounds** are found by the subject, not a body's `Fixes`:
  `git log -E --grep='^:[a-z_]+: [a-z]+\([^)]*\): (St[0-9]+ )?(S[0-9]+\+)*S4(\+S[0-9]+)*[. ]'`
  finds `S4.1` and `S4+S6`, not `S41`.

## Vocabulary

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
