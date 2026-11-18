---
paths:
  - "docs/tickets/**"
---

# A ticket's rounds

A ticket's commit opens its subject with its round, so `git log --oneline` shows step and source:

```text
:sparkles: feat(<slug>): St2 S4.1 Add the order parser
:bug: fix(<slug>): St2 S4.2 (REVIEW) Reject an empty order
:recycle: refactor(<slug>): St2 S5+S6 (STAGE) One order type for both
:rewind: revert(<slug>): St2 S5.3 (OWNER) Revert S5.2
:memo: docs(<slug>): St2 (VERIFY) Verify stage 2
:memo: docs(<slug>): St3 (PLAN) Prepare stage 3
:recycle: refactor(<slug>): L2.2 (OWNER) Drop the order helper
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
