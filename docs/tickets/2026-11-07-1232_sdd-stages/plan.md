# SDD in stages — plan

> Ticket: `2026-11-07-1232_sdd-stages` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | every round commits before it is read, under a name that says where it belongs; the owner's edits are a round | done |
| S2 | the architecture phase writes the high level, with direction and assumptions | done |
| S3 | the plan phase writes a skeleton and prepares one stage at a time | done |
| S4 | the verification runs for one stage at the owner's word, and reports the ticket per stage | done |
| S5 | a stage closes with a review of its code, a due verification runs, and the loop crosses it | done |
| S6 | the process guide describes stages, terms, models and the new loop | done |
| S7 | a sample ticket and a runner for the acceptance runs | todo |

## How to run this plan

- Branch `chore/sdd-stages`; commits by round, under the commit gate of `.claude/rules/sdd.md ›
  Gates` (`/ticket-implement`).
- Each step is a whole deliverable, leaves `make check` green and fits one fresh session (≤ ~400
  changed lines of code and tests; its docs counted apart).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.
- This plan is in the old form: stages apply to plans written after this ticket lands (R15).
- A file is edited by one step, so a step's instruction is whole when it lands, with one
  exception: the rounds (S1) and the stage's close (S5) are two outcomes, and one step holding
  both would break "one outcome" instead. So S1 and S5 each edit their own sections of
  `.claude/skills/ticket-implement/SKILL.md`, `.claude/rules/sdd.md`, `.claude/agents/reviewer.md`
  and `docs/knowledge/decisions.md` (one record each), and S1 and S6 their own lines of
  `docs/knowledge/sdd.md` and `README.md`, since `.claude/CLAUDE.md` wants the guide in the
  commit that changes the behaviour; each step's Files names its sections.
- The skills link the commit gate of `.claude/rules/sdd.md` and the names of
  `.claude/rules/commits.md` and never restate them, so S1 and S5 rewrite the gates without
  editing S3's and S4's files.
- This ticket's own commits use the names of D11 from S1 on, in the old form: `S1.1`,
  `S1.2 (REVIEW)`, `S1.3 (OWNER)`.
- A spawn line names its default as `` `<model> <effort>` `` in backticks, so a Verify counts
  them.

## Steps

#### S1 — Every round commits before it is read, under a name that says where it belongs

- **Delivers:** every commit of a ticket opens with its round's id and source (`St2 S4.3 (STAGE)`,
  `S4.2 (REVIEW)` in a plan of the old form), and a fix's body with the id of the round it fixes.
  A round commits as soon as `make check` is green, before the owner reads it, and the step's
  passes review the committed rounds; the owner's word decides whether the step closes. The
  owner's own edits, found between rounds, commit as an `OWNER` round first. A rejected round is
  reverted while it is the branch's last, and fixed forward once later work rests on it; no
  commit the owner has seen is amended or squashed.
- **Goal:** R13 (the gate), R18, R19 for the implement phase, R21, R22, R23; the Contracts entry
  **Commit names and rounds**; D7 (its R13 line), D9, D11.
- **Blocked by:** none.
- **Files:**
  - `.claude/rules/commits.md`: the subject opens with the round's id and, past a first pass, its
    source in capitals, the id counted apart from the 50 characters; a fix's body opens with
    `Fixes <id>: <what was wrong>`; the sources, the old-form id and the subject-anchored search
    of the Contracts entry, as patterns with neutral names; `:rewind:` `revert` joins the
    vocabulary, and a revert's subject names the round it reverts.
  - `.claude/rules/sdd.md`, its rounds and commit gates only: rounds named as `commits.md` says,
    committed when ready, the owner's edits a round between rounds, no presented commit rewritten,
    a revert only of the branch's last round; the sentence "The commit body opens with the round
    id" goes; the commit gate's question is whether a ready step closes without the owner's OK;
    its "Any other ticket artifact" sentence gains "a stage preparation with no question commits
    without the user's OK" (R13), whose procedure `stage.md` already holds.
  - `.claude/skills/ticket-implement/SKILL.md`, its steps 1 to 5 only: step 1 commits a change to
    tracked files that the session did not make as an `OWNER` round, its body naming what changed
    and what it reaches (callers and tests by a search), before anything else; step 2 commits the
    round once `simplify` and `make check` are done; step 3 reviews from the parent of `S<n>.1`
    to `HEAD`; step 5's close (Status, Findings) commits as a `PLAN` round, a rejection reverts or
    fixes forward as the gate says, nothing presented is amended. Every spawn of steps 2 to 4
    names its default: Standards `sonnet medium`, Spec `opus medium`, the hunt `opus high`, Design
    `opus high`, a question's `researcher` `opus high`, the no-op experiment `sonnet medium`, the
    implementer by the step's **Model** line, with D9's line on `fable` (R19).
  - `.claude/agents/reviewer.md`, its brief line only: the diff is the committed rounds' range,
    with no `git diff HEAD` note on untracked files.
  - `Makefile`: `review-rules` takes `BASE` (default `HEAD`) and lists the rules that bind
    `git diff $(BASE)` and the untracked files; `ticket-implement` passes the step's base.
  - `.claude/skills/ticket-implement/parallel-steps.md`: the pick onto the ticket branch keeps the
    rounds as commits, with no `--no-commit` merge into the last one.
  - `.claude/skills/ticket-implement/claimed-findings.md`: its step 2 carries over only what is
    uncommitted, since the worktree added at `HEAD` already holds the committed rounds; its
    confirmation's spawn names `opus high`, with D9's line on `fable` (R19).
  - `.claude/settings.json`: `Bash(git revert*)` in the allow list.
  - `docs/knowledge/tooling.md`: the `make review-rules` row; `docs/knowledge/sdd.md`: the lines
    on reviewing the uncommitted step (its plugin table's `implement` row, **The commit gate**'s
    review bullet), the skills table's `/ticket-implement` row (the commit gate's question), and
    one example history; `README.md`: its `/ticket-implement` row ("reviewed, then committed")
    and "Every step is reviewed before it is committed".
  - `docs/knowledge/decisions.md`: a record `### Rounds by commit` under "Guards, tests and
    history", in its seven fields.
  - Trap: a round the owner stopped is left uncommitted and named so in the status; only then
    does the next run's step 1 ask whose the changes are.
  - Trap: an edit during a live round is not an `OWNER` round; the owner says stop first.
- **Introduces:** `BASE` → `ticket-implement`'s step 3, in this step; the names → this ticket's
  commits. Removes later: none.
- **Size:** ~5 of code (the `Makefile` recipe), docs ~120.
- **Test first:** the files as written — `grep -c '(OWNER)' .claude/rules/commits.md` prints `0`
  before the step and at least `1` after; `make review-rules BASE=HEAD~1` on a branch whose last
  commit touches a `.ts` file lists `effect.md` after and not before (today it ignores `BASE`).
- **Verify:**
  - the two checks above;
  - `tr -s '\n ' ' ' < .claude/rules/sdd.md | grep -c 'commits without the user.s OK or waits'`:
    `1` before, `0` after; `tr -s '\n ' ' ' < .claude/rules/sdd.md | grep -c 'body opens with
    the round id'`: `1` before, `0` after;
  - `grep -c 'OWNER' .claude/skills/ticket-implement/SKILL.md`: `0` before, at least `1` after;
  - `grep -c 'no-commit' .claude/skills/ticket-implement/parallel-steps.md`: `1` before, `0` after;
  - `grep -c 'committed rounds' .claude/skills/ticket-implement/claimed-findings.md`: `0` before,
    at least `1` after;
  - `grep -c '(REVIEW)' .claude/rules/commits.md` and `grep -c 'old form'
    .claude/rules/commits.md`: `0` before, at least `1` each after;
  - `tr -s '\n ' ' ' < .claude/rules/sdd.md | grep -c 'stage preparation with no question'`:
    `0` before, `1` after;
  - `tr -s '\n ' ' ' < .claude/skills/ticket-implement/SKILL.md | grep -oE
    '(Standards|Spec|hunt|Design|researcher|no-op)[^.]*`(opus|sonnet) (medium|high)`' | wc -l`:
    `0` before, at least `6` after;
  - `grep -c 'git revert' .claude/settings.json`: `0` before, `1` after;
  - `grep -n '^### Rounds by commit' docs/knowledge/decisions.md`: empty before;
  - R18 re-measured: `wc -l < .claude/rules/sdd.md` and `wc -l < .claude/rules/commits.md` print
    at most the rule limit of `.claude/rules/claude-md.md`, and `make doc-lint` passes;
  - the step greps `uncommitted`, `S<n>.2`, `--amend` and `git diff HEAD` over the skills, the
    agents, the rules, `docs/knowledge/` and the `CLAUDE.md` files, and lists each line it
    rewrites (at plan time: the files above).
- **Model:** `opus high`
- **Status:** done
- **Findings:** rounds S1.1 to S1.5; passes Standards and Spec each round; claimed findings
  settled by a `researcher`.
  - implementer — accepted, recorded — Test first ran `make review-rules BASE=HEAD~4`, whose
    range holds `.ts` changes, instead of a branch whose last commit touches one (a checkout the
    implementer may not do): no `BASE` lists `commits.md` alone, `BASE=HEAD~4` lists 14 rules,
    `effect.md` among them.
  - implementer — accepted, recorded — `sdd.md` states the R13 stage-preparation rule without
    linking `stage.md`, which S3 creates; `doc-lint` fails on a missing path.
  - implementer — accepted, recorded — a step's close is `S<n>.<r> (PLAN)`, apart from a stage
    preparation's `St<n> (PLAN)`; added to the Contracts entry's examples.
  - implementer — accepted, recorded — lines edited beyond Files, each made wrong by the step:
    `ticket-implement/SKILL.md`'s `description` and The loop's "each ready step closes",
    `docs/knowledge/sdd.md`'s commit-gate intro and loop paragraph, `researcher.md` and
    `implementer.md` on the tree holding the current round, and `sdd.md`'s Deviations bullet
    (plan and architecture land in the `PLAN` round, `feature.md` and the `decisions.md` record
    in the round itself, since `plan.md` is edited only at the close).
  - Spec — accepted, fixed in S1.2 — the owner check ran only in step 1, so an edit by hand
    before feedback or a reject joined the next agent round.
  - Spec — accepted, fixed in S1.2 — the owner check covered tracked files only, so a new file of
    the owner's joined the next round; it now reads `git status --short`, wider than Files'
    "tracked files".
  - Spec — accepted, fixed in S1.2 — The loop and the guide still said a ready step "commits".
  - Standards — accepted, fixed in S1.2 — four wording fixes: the subject limit and the source,
    the reject bullet restating the gate, the `commits.md` anchor, which defaults `fable` may
    replace.
  - Spec — accepted, fixed in S1.3 — the close ran no owner check.
  - Spec — accepted, fixed in S1.3 — a reject's `git revert` took git's default `Revert "…"`
    subject, which the step search misses (probe repo: the search listed `S4.2` and `S4.1`, not
    the revert); a revert now commits by `--no-commit` under its round's name.
  - Spec — accepted, fixed in S1.3 — the review base did not say to take the oldest match of the
    newest-first search.
  - Standards — accepted, fixed in S1.3 — the skill restated the no-amend rule; `sdd.md`'s
    Deviations bullet clashed with `plan.md` edited only at the close.
  - Spec — accepted, fixed in S1.4 — a fresh session after a stopped round took the implementer's
    unfinished round for the owner's edit, since the stopped-round status lived only in the old
    session; a run's first owner check now asks whose each change is, wider than the Trap's
    "only then".
  - Standards — accepted, fixed in S1.4 — the subject limit still read as counting the id inside
    the 50 characters; the `fable` clause rewrapped.
  - Spec — accepted, fixed in S1.5 — no line said what a round's commit stages, once S1.1 dropped
    "stage the step's files"; the session had committed S1.1 to S1.4 with `git add -u`, which
    skips new files. Step 2 now stages with `git add -A`.
  - Standards — rejected: Files asks for D9's `fable` line in `claimed-findings.md` — drop the
    copy there and point at `SKILL.md` (raised three times).
  - Standards — accepted, open — the `decisions.md` record's Cost line quotes measured commit
    times (1.3 s, 2.5 s) that go stale with the pre-commit hook.
  - Spec — rejected: covered by `sdd.md`'s "the user says stop first" — `git add -A` would sweep
    an owner's edit made during a live round into the agent's round.
  - Out of step, for later steps: `ticket-verify/SKILL.md` still names models the old way (S4).

#### S2 — The architecture phase writes the high level

- **Delivers:** a ticket's architecture holds only the high level: seams, contracts, irreversible
  decisions, a direction of recommendations and assumptions that each name the stage that checks
  them. The architecture skill asks the owner about the high level only. The feature and
  architecture skills name the model and effort of each researcher they spawn.
- **Goal:** R1, R2, R19 for `/ticket-feature` and `/ticket-architecture`; the Contracts entry
  **The architecture's high level**; D6, D9.
- **Blocked by:** none.
- **Files:**
  - `docs/tickets/_template/architecture.md`: adds `## Direction` and `## Assumptions` in the
    shapes of the Contracts entry, an assumption as `A<n>` with `Checked in Stage <n>, by <a read |
    a probe>` and `If false:`; Structure names modules and workspaces, never files or signatures.
  - `.claude/skills/ticket-architecture/SKILL.md`: step 3 writes the high level only; grilling
    covers seams, contracts and irreversible decisions; a direction is written as a
    recommendation with no question round (R2); every assumption names its stage.
  - `.claude/skills/ticket-feature/SKILL.md`, `.claude/skills/ticket-architecture/SKILL.md`: the
    `researcher` spawn names `opus high` as its default, and one line lets the session take
    `fable` instead where it judges the result better for it, naming the model in its status
    (D9's table, first row).
  - Trap: the line on `fable` is written in each skill whole; it must not point at a guide section
    S6 writes.
- **Introduces:** `## Direction`, `## Assumptions`, `A<n>` → the architecture skill's step 3, in
  this step. Removes later: none.
- **Size:** ~0 of code and tests, docs ~70.
- **Test first:** the files as written — `grep -c '^## Direction\|^## Assumptions'
  docs/tickets/_template/architecture.md` prints `0` before the step and `2` after.
- **Verify:**
  - the grep above;
  - `grep -n 'effort' .claude/skills/ticket-feature/SKILL.md
    .claude/skills/ticket-architecture/SKILL.md`: empty before, one spawn line each after;
  - `grep -n 'Direction' .claude/skills/ticket-architecture/SKILL.md`: empty before;
  - `make doc-lint` passes.
- **Model:** `opus high`
- **Status:** done
- **Findings:** rounds S2.1 to S2.4; passes Standards and Spec after S2.1, S2.2 and S2.3, S2.4
  not re-reviewed; claimed findings settled by a `researcher`. Verify after S2.4: the template
  grep prints `2`, `effort` is on `ticket-feature/SKILL.md:31` and
  `ticket-architecture/SKILL.md:20`, `make doc-lint` and `make check` exit 0.
  - implementer — accepted, recorded — the template writes `A1`, like its `D1`; the Contracts
    sketch keeps `A<n>`.
  - implementer — accepted, recorded — an assumption names the first stage whose work rests on
    it, since no plan exists when the architecture is written; added to the Contracts entry.
  - implementer — accepted, recorded — `ticket-feature`'s step 3 spawn says "on `opus high`"
    without the word `effort`, so the Verify grep stays at one line per file.
  - implementer — accepted, recorded — a line edited beyond Files, made wrong by the step:
    `docs/tickets/_template/feature.md`'s `Answer` placeholder (S2.3, S2.4).
  - Spec — rejected: refuted by a `researcher` — `researcher.md`'s front matter still says
    `sonnet medium`; a spawn sets model and effort, and D9 rejects the session choosing unseen.
  - Spec — accepted, fixed in S2.2 — the template let a decision drop its rejected alternative,
    against R1.
  - Standards — accepted, fixed in S2.2 — the Direction steered by prohibition; the template said
    "the owner" where the skill says "the user".
  - Standards — rejected: the Trap asks for the `fable` line whole in each skill — drop the copy
    and link one home (raised three times).
  - Spec — accepted, fixed in S2.3, confirmed by a `researcher` — an open question a stage can
    still settle could close only as a `D…`, which puts a direction to the user, against R2.
  - Standards — accepted, fixed in S2.3 — the skill's step 3 and the template's Structure and
    Contracts named what the architecture leaves out instead of what it holds.
  - Standards — rejected: R19 names the default at each spawn — `ticket-feature` names
    `opus high` at both of its spawns (raised twice).
  - Spec — accepted, fixed in S2.4 — S2.3 dropped the template's limit on files and signatures;
    the template's `Answer` dropped the stage that settles a direction.
  - Standards — accepted, fixed in S2.4 — the skill's step 4 still said "not asked".
  - Out of step, for S6: the guide's map says an agent's front matter is only the fallback for a
    spawn that names no model, so `researcher.md`'s `sonnet medium` reads as intended.

#### S3 — The plan phase writes a skeleton and prepares one stage at a time

- **Delivers:** a first plan lists every step of the ticket as a skeleton, grouped in stages of
  three by default, each stage naming its outcome and the requirements it completes, and prepares
  the first stage in full for one approval. `/ticket-plan <ticket> next` prepares the next stage
  from the feature, the architecture and what the closed stages delivered: it checks the facts
  first, writes the stage design and the full steps, runs the plan check with coverage, and puts
  to the owner only what the triage names. A ticket of one stage is planned as before; a plan
  without a stage heading stays in its old form.
- **Goal:** R3–R9, R12 (the command exists), R14 and R15 on the plan's side, R19 for the plan's
  researchers; the Contracts entries **The plan's layout**, **The stage procedure**, **The
  triage**, **The caller's end** and **The preparation's commit**; D1, D3, D4, D6.
- **Blocked by:** S1, S2.
- **Files:**
  - `docs/tickets/_template/plan.md`: the layout of the Contracts entry: `## Status` split into
    `### Stage <n> — <outcome> · completes R…` tables (`Step | Delivers | Serves | Size |
    Status`); one `## Stage <n> — <title>` section per stage with `### Stage design`, `### Steps`
    and `### Stage review`; an unprepared stage as one line naming `/ticket-plan <ticket> next`;
    the coverage table with a `Completed in` column. The step's own fields stay as they are; the
    Probes line stops citing a step number of the skill.
  - `.claude/skills/ticket-plan/stage.md`, **new**: the stage procedure, In, Does, Out as the
    Contracts entry, the step fields and their Verify rules moved from today's step 3, the check of
    today's step 4 with its probe worktree recipe, the coverage list that fails on a requirement no
    step serves (R7), the triage (R8; R9 only for a choice that changes a Contract; a skeleton row
    never dropped without a finding), the fact check's results committed at once as `St<n> (PLAN)
    Record the facts of stage <n>` before the design, and the commit `Prepare stage <n>` under the
    commit gate of `.claude/rules/sdd.md` and named as `.claude/rules/commits.md` says, both linked,
    neither restated. It ends by returning to its caller; it describes no caller's end but the plan
    skill's. Its researchers: the fact check and the plan check on `opus high`, the guard probes on
    `sonnet medium`, with D9's line on `fable`.
  - `.claude/skills/ticket-plan/SKILL.md`: `argument-hint: "<ticket folder> [next]"`; without
    `next`: read the sources, cut the skeleton (today's step 2 rule of deliverables, now per
    step and per stage), run `stage.md` for stage 1, present the skeleton and stage 1 for one
    approval (R5); with `next`: run `stage.md` for the first unprepared stage and end as the
    caller table says. A ticket that fits one stage is one stage, prepared at once (R14). The
    line "This is the heavy review" is rewritten to the skeleton and the first stage. A plan
    without `### Stage` is not re-cut (R15).
  - Trap: `.claude/skills/ticket-plan/guard-probes.md` is read by `stage.md` now; its text names
    no step number and stays.
  - Trap: every caller reads `stage.md` afresh at each preparation, since compaction does not
    restore a file only read; the file says so in its first lines.
  - Trap: the stage procedure looks only forward: it reads the closed stages' design, review and
    any verification run as its base and never re-reviews them.
- **Introduces:** `stage.md` → `SKILL.md`'s both modes, in this step; `next` → `SKILL.md`, in
  this step; `### Stage <n>` and `Completed in` → `stage.md`'s coverage list. Removes later: none.
- **Size:** ~0 of code and tests, docs ~220.
- **Test first:** the files as written — `test -f .claude/skills/ticket-plan/stage.md` fails
  before the step; `grep -c '^### Stage' docs/tickets/_template/plan.md` prints `0` before.
- **Verify:**
  - the two checks above, passing after;
  - `grep -n 'argument-hint' .claude/skills/ticket-plan/SKILL.md` names `next` after, not
    before;
  - `tr '\n' ' ' < .claude/skills/ticket-plan/SKILL.md | grep -c 'later steps only conform to
    the plan'` prints `1` before and `0` after;
  - `grep -c '`opus high`' .claude/skills/ticket-plan/stage.md` prints at least `2` (the fact
    check, the plan check) and `grep -c '`sonnet medium`' .claude/skills/ticket-plan/stage.md` at
    least `1` (the guard probes);
  - `make doc-lint` passes.
- **Model:** `opus high`
- **Status:** done
- **Findings:** rounds S3.1 to S3.3; passes Standards and Spec after each round; two claimed
  findings settled by a `researcher`, both confirmed. Verify after S3.1: `stage.md` exists, the
  template's `^### Stage` count is `4`, `argument-hint` reads `"<ticket folder> [next]"`, the
  "later steps only conform" count is `0`, `stage.md` holds `` `opus high` `` 4 times and
  `` `sonnet medium` `` once, `make doc-lint` and `make check` exit 0; after S3.3, `make check`
  exits 0.
  - implementer — accepted, recorded in `architecture.md` — the facts commit is named
    `Record the facts of stage <n>`, as the step says, not the Contract's `Facts`.
  - implementer, Spec (raised three times) — accepted, recorded in `architecture.md` — a first
    plan's facts commit with its approval as `St1 (PLAN) Prepare stage 1`, since the commit gate
    commits an artifact only once confirmed; the facts may be lost before that, and a fact check
    reruns them.
  - implementer — accepted, recorded in `architecture.md` — the facts head the stage design.
  - Spec, confirmed by a `researcher` — accepted, fixed in S3.2 — a step over ~400 lines split
    "before the stage is presented", but `next` commits a stage with no question unpresented.
  - Spec, confirmed by a `researcher` — accepted, fixed in S3.3 — `next` found a stage only by
    its "Not prepared" line, so a stage with its facts committed and a question round open could
    not be resumed.
  - Standards — accepted, fixed in S3.2 and S3.3 — the read-afresh reason and three bans named
    no positive target; the `fable` line cut the step list.
  - Spec — accepted, recorded in `architecture.md` — two `St<n> (PLAN)` commits per stage made
    the Stage review's base ambiguous; it is the `Prepare stage <n>` commit.
  - Standards — rejected (raised three times): `.claude/rules/sdd.md:34` and
    `docs/knowledge/sdd.md:46` still say the heavy review lands once on the plan — S5 and S6 own
    those lines.
  - Standards — rejected (raised twice): the `fable` section restates D9 and should move again —
    D9 asks for the line in each spawning file, and S3.2 moved it out of the steps at the
    reviewer's request.
  - Standards — rejected: the template's Probes line and `stage.md` hold one fact twice — the
    template links the procedure.
  - Out of step, for S5: the commit gate of `.claude/rules/sdd.md` names the facts commit, which
    lands before the triage and so before the owner confirms a stage that raises a question.
  - Out of step, for S6: the guide's dependency map adds `stage.md` and its `researcher` spawns.

#### S4 — The verification runs one stage on request and reports the ticket per stage

- **Delivers:** `/ticket-verify <ticket> stage <n>` verifies the requirements a stage completes
  and the earlier ones whose files it changed, from the stage's base, fixes a failure before
  anything else runs, and appends a section for the
  stage. The whole-ticket run adds a table with one row per stage: the deviations that changed a
  step's outcome or order, those that changed only details, the edits to later steps, and whether
  the loop stopped there. Every agent it spawns names its model and effort.
- **Goal:** R16, R20 (the mode and its fix), R19 for the verification; the Contracts entries
  **The stage verification** and **The per-stage table**; D8, D10.
- **Blocked by:** S3.
- **Files:**
  - `.claude/skills/ticket-verify/SKILL.md`: `argument-hint: "<ticket folder> [stage <n>]"`; the
    stage mode takes the requirements whose `Completed in` is the stage and the earlier ones whose
    steps' files the stage's diff changed, groups them as step 1 does, sets the fixed point to the
    stage's preparation commit (the plan's commit for stage 1), spawns no reviewer and writes no
    lessons; a `fail` goes to an `implementer` as the next round of the step whose code it
    changes, its spawn line naming `opus high` (or the step's **Model** line), committed under the
    gate and the round rule of `.claude/rules/sdd.md`, linked, not restated; only the failed
    requirements run again; a failure that needs a requirement changed is the owner's question;
    it appends `## Stage <n> — <date>`. The rule "Fix nothing during verification" stays for the
    whole-ticket run. The whole-ticket run sums the per-stage table from each `### Stage review`,
    the steps' findings, the stage sections and `git log -p -- plan.md`. Spawns: `verifier`
    `opus high` (`xhigh` for a stage over ~30 minutes of work), Standards `sonnet medium`, Spec
    `opus high`, with D9's line on `fable`.
  - `docs/tickets/_template/verification.md`: the stage section's shape (its requirements table
    and the rounds that fixed a failure) and the per-stage table in the whole-ticket run.
  - `.claude/agents/verifier.md`: its line on the fixed point (today "the brief's merge-base
    with the PR's base branch") names the brief's fixed point, whichever it is, so a stage run's
    base holds; its line "fixing them is a later plan step" names the stage mode's round too.
  - Trap: a plan without stages has no `Completed in`; the stage mode then stops and says so.
- **Introduces:** `stage <n>` → the skill's own stage mode; the per-stage table → the
  whole-ticket run. Removes later: none.
- **Size:** ~0 of code and tests, docs ~70.
- **Test first:** the files as written — `grep -c 'Completed in'
  .claude/skills/ticket-verify/SKILL.md` prints `0` before the step and at least `1` after.
- **Verify:**
  - `grep -n 'argument-hint' .claude/skills/ticket-verify/SKILL.md` names `stage` after;
  - `grep -n '| Stage |' docs/tickets/_template/verification.md`: empty before, the per-stage
    table's header after;
  - `grep -n 'merge-base' .claude/agents/verifier.md`: a line before, none after;
  - `tr -s '\n ' ' ' < .claude/skills/ticket-verify/SKILL.md | grep -oE
    'implementer[^.]*`(opus|sonnet) (medium|high)`' | wc -l`: `0` before, at least `1` after;
  - `make doc-lint` passes.
- **Model:** `opus high`
- **Status:** done
- **Findings:** rounds S4.1 to S4.4; passes Standards and Spec after each round; three claimed
  findings settled by a `researcher`, all confirmed. Verify after S4.4: `Completed in` count `2`,
  `argument-hint` reads `"<ticket folder> [stage <n>]"`, the template's header on line 36, no
  `merge-base` in `verifier.md`, the implementer regex `1`, `make doc-lint` and `make check`
  exit 0.
  - implementer — accepted, recorded — "Fix nothing during verification" narrowed to the
    whole-ticket run, which the stage mode's fix would otherwise contradict.
  - implementer — accepted, recorded — every stage's base is the `Prepare stage <n>` commit,
    stage 1's included, as S3 named it.
  - Spec, confirmed by a `researcher` — accepted, fixed in S4.2, recorded in `architecture.md` —
    the stage range ran to `HEAD`, so a stage verified after the next one closed took in its
    files; it ends at the parent of the next stage's preparation commit.
  - Standards — accepted, fixed in S4.2 and S4.3 — the stage mode's second step named no done
    condition, and "step 1" was ambiguous inside a section with its own steps.
  - Spec — accepted, fixed in S4.3 — the base and end lookups matched any line, not the subject.
  - Spec, confirmed by a `researcher` — accepted, fixed in S4.4, recorded in `architecture.md` —
    a re-run after a `VERIFY` fix, briefed on the same range, never listed the fix; its brief
    names the fix's commits (briefing to `HEAD` was rejected: it takes in the next stage).
  - Spec, confirmed by a `researcher` — accepted, moved to S5's Files — inside a loop the stage
    section's commit waits for the user under the commit gate, and no rule names its subject;
    the gate and `commits.md` are S1's and S5's files, so S5 now edits both.
  - Standards — accepted, open — `ticket-verify/SKILL.md` step 2 paraphrases the per-stage
    table's columns the template holds.
  - Standards — rejected (raised three times): the `fable` section restates D9 — D9 asks for the
    line in each spawning file.
  - Standards — rejected: the lookup restates the preparation's subject — a lookup needs its
    literal text, and `commits.md` owns the format.
  - Standards — rejected: "No reviewer … no lessons" steers by prohibition — an earlier pass
    accepted it as a scope line with its reason, as the Contract words it.
  - implementer — accepted, open — `ticket-plan/SKILL.md › next` (S3) finds the preparation
    commit with an unanchored `git log --grep`; a body quoting that subject would match too.
  - Out of step, for S6: the guide's dependency map adds `implementer` under `/ticket-verify`.

#### S5 — A stage closes with a review of its code, a due verification runs, and the loop crosses it

- **Delivers:** the last step of a stage also runs `simplify` over the stage's committed diff,
  then Standards and Design over it; Standards asks where each deleted rule or case now lives,
  Design also reports departures from the architecture and the stage design and scaffolding a
  later step rewrites, only what changes correctness or shape. Each accepted fix commits as one
  `STAGE` round carrying the id of each step whose code it changes, made by the last step's
  implementer with those steps' Files and Traps. Outside a loop the close names `/ticket-plan <ticket> next` (or
  `/ticket-verify` after the last stage) and a due stage verification; in a loop it runs a due
  verification, fixes a reshape that contradicts no decision, prepares the next stage and goes
  on, stopping only where the owner must answer. The gates say where the heavy review lands now
  and that a stage preparation with no question commits without the owner's OK; a record keeps
  why.
- **Goal:** R10, R11, R12 (the step names the command), R14 and R15 on the implement side, R18,
  R20 (when it runs); the Contracts entries
  **The Stage review**, **The stage verification** (its due rule), **The caller's end**; D2, D5,
  D7, D9, D10.
- **Blocked by:** S1, S3, S4.
- **Files:**
  - `.claude/agents/reviewer.md`, its passes only: the **Design** pass, when its brief names a
    stage's diff and sources, also reports a departure from `architecture.md`, the skeleton or the
    stage design, and scaffolding a later skeleton step rewrites, and only what changes correctness
    or shape; the **Standards** pass, given a `simplify` round, asks where each deleted rule or case
    now lives. No pass is added, and none is named "Stage".
  - `.claude/skills/ticket-implement/SKILL.md`, its stage close, step 6 and **The loop**: the
    close of the Contracts entry on a step whose row is the last of its stage in a plan of more
    than one stage, from the stage's `St<n> (PLAN) Prepare stage <n>` commit, `simplify`'s args
    naming that range;
    the last implementer resumed by its agent id, or a fresh one with its step's brief when it
    was stopped; `### Stage review` in the close's `PLAN` round; the due rule of D10; step 6
    names the next command and a due verification, or, in a loop, runs the verification, then
    reads `.claude/skills/ticket-plan/stage.md` afresh and runs it; **The loop** gains the stop
    "a stage preparation with a question round", fixes a Design reshape that contradicts no
    `D…`, and holds one that does as an open finding for its next stop. Its passes are spawned on
    the defaults S1 wrote in step 3.
  - `.claude/rules/sdd.md`, its Artifacts rows, heavy-review gate and commit gate only:
    `architecture.md` (direction, assumptions) and `plan.md` (skeleton, stages, stage design,
    Stage review); "The heavy review lands once, on the plan" rewritten to the skeleton and the
    first stage, each later stage checked when prepared and reviewed when it closes; the commit
    gate also commits without the user's OK a stage's facts, which land before its triage, and a
    stage verification's section when no failure needs a requirement changed, so a loop crosses
    a due verification (S3, S4 findings). Stays within its limit.
  - `.claude/rules/commits.md`, its round ids only: a stage verification's section commits as
    `St<n> (VERIFY) Verify stage <n>` (S4 finding).
  - `docs/knowledge/decisions.md`: a record `### Plans in stages` under "Guards, tests and
    history", in its seven fields; **Revisit when:** `lambda-processes` and `telemetry-minimal`
    have reported their per-stage tables.
  - Trap: the plan without `### Stage` runs as today but for S1's names: no Stage review, no
    stage verification (R15); a plan of one stage too (R14).
- **Introduces:** the stage close → `ticket-implement`'s step 6, in this step; the loop's new
  stop → **The loop**. Removes later: none.
- **Size:** ~0 of code and tests, docs ~110.
- **Test first:** the files as written — `tr -s '\n ' ' ' < .claude/rules/sdd.md | grep -c 'once,
  on the plan'` prints `1` before and `0` after; `grep -c 'ticket-plan/stage.md'
  .claude/skills/ticket-implement/SKILL.md` prints `0` before and at least `1` after.
- **Verify:**
  - the two checks above;
  - `grep -c 'stage <n>' .claude/skills/ticket-implement/SKILL.md`: `0` before, at least `1`
    after;
  - `grep -c 'scaffolding' .claude/agents/reviewer.md` and `grep -c 'deleted'
    .claude/agents/reviewer.md`: `0` before, at least `1` each after;
  - `grep -n 'commit' .claude/skills/ticket-plan/stage.md .claude/skills/ticket-plan/SKILL.md
    .claude/skills/ticket-verify/SKILL.md` (a manual check): the gate and the names linked, not
    restated, so their rewrite needs no edit there;
  - `grep -n '^### Plans in stages' docs/knowledge/decisions.md`: empty before;
  - R18 re-measured: `wc -l < .claude/rules/sdd.md` prints at most the rule limit, and
    `make doc-lint` passes;
  - the step greps `heavy review` and `once, on the plan` over the `architecture.md` files of
    open tickets, the records and the `CLAUDE.md` files, and lists each line it rewrites (at
    plan time: `.claude/rules/sdd.md` alone, beside the lines S3 and S6 own).
- **Model:** `opus high`
- **Status:** done
- **Findings:** rounds S5.1 to S5.4; passes Standards and Spec after each round (a docs-only step:
  no `simplify`, Design or hunt); five claimed findings settled by a `researcher`, all confirmed.
  Verify after S5.4: `once, on the plan` in `sdd.md` `0`, `ticket-plan/stage.md` in
  `ticket-implement` `1`, `stage <n>` `3`, `scaffolding` `1` and `deleted` `2` in `reviewer.md`,
  `822:### Plans in stages`, `wc -l < .claude/rules/sdd.md` `63`, `make doc-lint` and
  `make check` exit 0; the `heavy review` grep rewrote `.claude/rules/sdd.md:34` alone.
  - implementer — accepted, recorded in `architecture.md` — the due rule counts from the last
    `## Stage <k>` section of `verification.md`, reads a contract as an interface another module
    or a later stage uses, counts the preparation commit, and runs at every close, the last too.
  - implementer — accepted, recorded in `architecture.md` (D1) — in a loop the stage verification
    runs by reading `ticket-verify/SKILL.md` afresh, not through the Skill tool, as D1 argues for
    `stage.md`.
  - implementer — accepted, recorded in `architecture.md` — a `STAGE` fix round re-runs Standards
    and Design over the stage's range, as a step's feedback round returns to its passes.
  - Spec, confirmed by a `researcher` — accepted, fixed in S5.2, recorded in `architecture.md` —
    the due rule named only `architecture.md`, so a contract changed in code alone skipped the
    verification R20 asks for.
  - Spec, confirmed — accepted, fixed in S5.2 — the Standards brief named a `simplify` commit
    that does not exist when `simplify` changes nothing.
  - Spec — accepted, fixed in S5.2 — the record's Why explained one of the three commits that
    skip the user's OK.
  - Standards — accepted, fixed in S5.2 — step 5's opening did not parse; step 6 packed four
    cases into one sentence and restated the due rule.
  - Standards — accepted, fixed in S5.2 — a fresh implementer for a `STAGE` fix named no model.
  - Spec, confirmed — accepted, fixed in S5.3, recorded in `architecture.md` — the close's fix
    rounds had no bound, since the loop's three belonged to a step whose passes had settled.
  - Spec, confirmed (a no-op run: 3 of 3 wrote two commits before, one `S7+S9 (STAGE)` after) —
    accepted, fixed in S5.3, recorded in `architecture.md` — "a `STAGE` round of each step" read
    as one commit per step.
  - Spec — accepted, fixed in S5.3, recorded in `architecture.md` — Design was told a
    correctness bug is the hunt's while no hunt runs over a stage's diff.
  - Spec — accepted, fixed in S5.3 — the loop's stop on a finding for the user also matched the
    Design finding held open without a stop.
  - Spec, confirmed — accepted, fixed in S5.4 — the record's Guarded by claimed `/ticket-implement`
    finds no `todo` step in an unprepared stage, yet the template's later rows read `todo`; step 1
    now runs no step without its own `#### S<n>` section and names `/ticket-plan … next`.
  - Spec — accepted, recorded — S5.4 edits `ticket-implement` step 1, outside this step's Files
    (S1's section), for the guard the record rests on.
  - Standards — rejected (raised three times): the record's Why restates the gate's three
    commits — the gate holds the rule, the record why each may skip the OK, as a Spec finding
    asked.
  - Standards — rejected: the Design paragraph belongs under the close's step 4 — it holds in a
    loop only, and the step's Files place it in **The loop**.
  - Standards — rejected: Guarded by restates step 1's guard — naming the guard is that field's
    job.
  - Standards — rejected: step 1's new line leads with the prohibition — its action follows in
    the same line.
  - implementer — accepted, open — `.claude/rules/sdd.md:45` says `plan.md` is edited only at a
    step's close, while a stage's facts and preparation commits edit it too.
  - implementer — accepted, open — `make doc-lint` does not check an `#anchor` in another file
    (a planted `#plans-in-stagez` passed).
  - Out of step, for S6: the guide's dependency map and the `/ticket-implement` row gain
    `simplify` on a stage's range and the reads of `stage.md` and `ticket-verify/SKILL.md`
    (Standards, under `claude-md.md › The toolkit`).

#### S6 — The process guide describes stages, terms, models and the new loop

- **Delivers:** the process guide defines the stage, the skeleton, the stage design, the
  direction, the Stage review (the three passes over a stage's diff) and the stage verification
  (when due: named outside a loop, run inside one); its diagram and its loop show stages;
  its skills table, its dependency map and its README row match the skills' files, the map with
  each agent's default model and effort and the rule for `fable`; it says stages apply to plans
  written after this ticket. The glossary holds none of these terms.
- **Goal:** R15 (the guide's line), R17, R19 (the map); D7, D9.
- **Blocked by:** S5.
- **Files:**
  - `docs/knowledge/sdd.md`, all but S1's lines on rounds: the first diagram; the skills table (the
    `/ticket-plan` row's "the plan as a whole: the heavy review", its `next`, the `/ticket-verify`
    row's `stage <n>`; the `/ticket-implement` row is S1's); a section on stages with the terms; the
    dependency map (`stage.md`, `/ticket-verify`'s `implementer` for a stage's `VERIFY` round,
    the `reviewer` row's Design and Standards at a stage's close, a
    column of model and effort per use, D9's rule once); **The loop** with the stage boundary. A
    term keeps the name of the existing Design pass apart, and says the process stage is unrelated
    to the deployment `STAGE` and to the glossary's avoided "stage" of a message.
  - `README.md`: its `/ticket-plan` row ("the one heavy review"); its other lines are S1's.
  - Trap: the guide restates no line of `.claude/rules/sdd.md`, which S1 and S5 wrote in its
    final form; a line it would repeat is linked instead, and the rule is not edited here.
- **Introduces:** none. Removes later: none.
- **Size:** ~0 of code and tests, docs ~120.
- **Test first:** the files as written — `grep -c 'skeleton' docs/knowledge/sdd.md` prints `0`
  before the step and at least `1` after.
- **Verify:**
  - `grep -n 'plan as a whole' README.md docs/knowledge/sdd.md`: two lines before, none after;
  - guard, not a red check: `grep -niE 'skeleton|stage design' docs/knowledge/glossary.md`
    stays empty;
  - one command compares the map with the files: `diff <(grep -rhoE '`(opus|sonnet)
    (medium|high|xhigh)`' .claude/skills .claude/agents | sort -u) <(grep -oE '`(opus|sonnet)
    (medium|high|xhigh)`' docs/knowledge/sdd.md | sort -u)` prints nothing;
  - `make doc-lint` passes.
- **Model:** `opus high`
- **Status:** done
- **Findings:** rounds S6.1 to S6.3; passes Standards and Spec after each round (a docs-only step:
  no `simplify`, Design or hunt). Verify after S6.3: `grep -c 'skeleton' docs/knowledge/sdd.md`
  `5` (`0` before); the `plan as a whole` grep and the glossary guard print nothing; the map
  `diff` prints nothing; `make doc-lint` and `make check` exit 0.
  - implementer — accepted — the map's agent rows read "the spawn's" in the model column: the
    skill sets the model at each spawn, and an agent's front matter is the fallback D9 rejects.
  - Standards — accepted, fixed in S6.2 — the guide told staged plans apart by when they were
    written ("written before stages", "since they were introduced"), a history a living doc
    does not hold.
  - Spec — accepted, fixed in S6.2 — the `/ticket-verify` row spawned an `implementer` for a
    stage's `VERIFY` round but its Hook cell read `—`.
  - Spec — accepted, fixed in S6.2 — the rule for `fable` said "a verifier" where D9 says "the
    verification".
  - Spec — accepted, fixed in S6.3 — after S6.2 the guide no longer said that `/ticket-plan`
    writes every plan in stages and that an existing plan is not re-cut (R15).
  - Spec — accepted, fixed in S6.3 — the first diagram led a due stage verification only to
    `next`, though after the last stage `ticket-implement` names it before `/ticket-verify`.
  - Standards (twice) — rejected: S6's Files asks for D9's rule once in the guide — the rule for
    `fable` restates the skills' spawn lines; link D9 instead.
  - Standards — rejected: R19 and S6's Files ask for the column, and the step's map `diff` keeps
    it true — the model column copies values the skills own and goes stale.
  - Standards — rejected: S6's Delivers asks that the loop show stages, and the step's Trap bars
    restating the rule, not the skill — the loop's stage-boundary paragraph restates
    `ticket-implement/SKILL.md › The stage close`; replace it with a link.
  - S5's note for S6 (the map gains `simplify` on a stage's range and the reads of `stage.md`
    and `ticket-verify/SKILL.md`) — done in S6.1, in the `/ticket-implement` row of the map.

#### S7 — A sample ticket and a runner for the acceptance runs

- **Delivers:** a sample ticket in this ticket's folder, with the states the acceptance needs as
  commit histories, and one script that builds a state in a `git clone --local` outside the tree
  and runs a phase in it with `claude -p`, printing the run's output and the clone's `git log`.
  The verifiers run every acceptance that names the sample through it.
- **Goal:** R1–R16 and R20–R23 through the second Seam of `architecture.md`.
- **Blocked by:** S5.
- **Files:**
  - `docs/tickets/2026-11-07-1232_sdd-stages/sample/`: a small feature of about six steps in two
    stages, docs or a few lines of code each, so a loop over a stage boundary finishes in one run;
    its `feature.md`, and one script per state under `sample/states/`, each making the commits the
    state needs with the names of `commits.md`: `feature-only` (R1–R5), `stage-1-done` (R6,
    R10–R13, R20, R21, R23: the plan commit, `St1 S1.1` to `St1 S3.1`), and variants of it:
    `owner-edit` (one tracked file edited and left uncommitted, R22), `no-coverage` (a
    requirement's only step removed, R7), `forced-choice` (an assumption of stage 2 a probe shows
    false, so two contract shapes remain, R8), `used-later` (a stage choice that changes a
    contract and whose `used by` names a later stage, R9), `three-steps` (R14), `all-done` (R16).
  - `docs/tickets/2026-11-07-1232_sdd-stages/sample/run.sh`: `run.sh <state> ("<prompt>" |
    --no-run)`; clones into the system temp directory, cuts `chore/sample`, commits the sample
    ticket as `docs/tickets/2026-01-01-0000_sample/`, runs the state's script, then either runs
    `claude -p --setting-sources project` with the prompt or, with `--no-run`, prints the clone's
    `git log --oneline`; it prints the clone's path.
  - Trap: the sample's assumption that fails must fail by a run in the clone, not by its text,
    or R6's probe proves nothing.
- **Introduces:** `run.sh`, `sample/states/` → the step's own Verify. Removes later: none.
- **Size:** ~90 of code, docs ~250.
- **Test first:** `config only` — `test -x docs/tickets/2026-11-07-1232_sdd-stages/sample/run.sh`
  fails before the step.
- **Verify:**
  - `sample/run.sh three-steps "/ticket-plan docs/tickets/2026-01-01-0000_sample/"` ends with one
    stage and no Stage review in the clone's `plan.md`;
  - `sample/run.sh stage-1-done --no-run` builds the state without a run and prints the clone's
    `git log --oneline`, whose subjects open with `St1 S1.1` to `St1 S3.1`;
  - `make sh-lint` passes on the scripts;
  - `make doc-lint` passes.
- **Model:** `opus high`
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S2 |
| R2 | S2 |
| R3 | S3 |
| R4 | S3 |
| R5 | S3 |
| R6 | S3 |
| R7 | S3 |
| R8 | S3 |
| R9 | S3 |
| R10 | S5 |
| R11 | S5 |
| R12 | S3, S5 |
| R13 | S1 |
| R14 | S3, S5 |
| R15 | S3, S5, S6 |
| R16 | S4 |
| R17 | S6 |
| R18 | S1, S5 |
| R19 | S1, S2, S3, S4, S6 |
| R20 | S4, S5 |
| R21 | S1 |
| R22 | S1 |
| R23 | S1 |

The sample of S7 is where the verification observes R1–R16 and R20–R23.
