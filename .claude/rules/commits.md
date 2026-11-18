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

A ticket's commit opens its subject with its round, so `git log --oneline` shows step and source:

```text
:sparkles: feat(<slug>): St2 S4.1 Add the order parser
:bug: fix(<slug>): St2 S4.2 (REVIEW) Reject an empty order
:recycle: refactor(<slug>): St2 S5+S6 (STAGE) One order type for both
:rewind: revert(<slug>): St2 S5.3 (OWNER) Revert S5.2
:memo: docs(<slug>): St2 (VERIFY) Verify stage 2
:memo: docs(<slug>): St3 (PLAN) Prepare stage 3
```

- **The id:** `St<stage> S<step>.<round>`; a stage's preparation and its verification's section
  are `St<stage>` alone; a plan without stages drops the stage (`S4.2 (REVIEW)`). A lab step's is
  `L<step>.<round>` (`.claude/rules/lab.md`); `L0` is the lab itself, its start and its close.
- **The source**, in capitals, past the implementer's first run: `REVIEW` the step's passes, `OWNER`
  the user's word or edit, `STAGE` the Stage review, `VERIFY` a verification, `PLAN` a plan-only
  edit (a stage's preparation, a step's close); the gitmoji and type keep the kind.
- **A fix** carries the id of each step whose code it changes (`S5+S6`), and its body opens with
  `Fixes <the fixed round's id>: <what was wrong>`; never a hash, stale after a cherry-pick.
- **A revert's** subject names each round it reverts.
- **A step's rounds** are found by the subject, not a body's `Fixes`:
  `git log -E --grep='^:[a-z0-9_-]+: [a-z]+\([^)]*\): (St[0-9]+ )?(S[0-9]+\+)*S4(\+S[0-9]+)*[. ]'`
  finds `S4.1` and `S4+S6`, not `S41`; a lab step's, by
  `git log -E --grep='^:[a-z0-9_-]+: [a-z]+\([^)]*\): (L[0-9]+\+)*L2(\+L[0-9]+)*[. ]'`.

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
