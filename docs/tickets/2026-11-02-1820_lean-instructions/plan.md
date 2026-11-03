# Lean instructions — plan

> Ticket: `2026-11-02-1820_lean-instructions` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | the baseline: what each lever's target loads today | done |
| S2 | `doc-names` over every doc, refusing a source path in an instruction file; `rule-paths` | done |
| S3 | reviewers read only the cited design and the matching rules; the implementer reads no rule up front | done |
| S4 | parallel steps read on demand; the worktree setup a script | todo |
| S5 | the commit gate in one place, asked once per session; skills and agents as patterns | todo |
| S6 | agents do only their own part; the main session orchestrates on reports; one hunt pass by condition; `/simplify` from the main session; parallel verifiers | todo |
| S7 | the Effect rules and the comments rule trimmed; the Effect-4 trap first | todo |
| S8 | naming, layering, modules and deep modules trimmed, one file per subject | todo |
| S9 | every `CLAUDE.md` and the process rules as patterns; `doc-limits` | todo |
| S10 | `architecture.md`, `README.md` and the glossary own only their facts | todo |
| S11 | tooling, AWS, database and AI pages own only their facts; the local stand's `README.md` gone | todo |
| S12 | decisions and the SDD guide trimmed; `docs-diet` done; the move probe | todo |
| S13 | the ticket templates and the planning skills pin what a step needs and leave the rest to a grep | todo |

## How to run this plan

- Branch `refactor/lean-instructions`, off `refactor/modular-monolith`, with its own PR into that
  branch so its diff reads alone (the user's word, 2026-11-02); it starts once that ticket's
  verification passes (run 3, `2a2616495f`). One commit per step under the commit gate of
  `.claude/rules/sdd.md` (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines, counted
  with `git diff -M --stat`; `bun.lock` excluded).
- A Verify's `git grep` runs with `':!docs/tickets' ':!repos'`, so the ticket's own docs and the
  vendored repos never match.
- **The ledger.** A step that rewrites an instruction file or a doc lists in its report each
  removed line with its new home, or "dropped:" and why Claude or a reader gets it right without
  it, and each trap added and where (R3, R5). Review reads the ledger, not only the diff.
- **The traps to place** (R5), each from the branch's findings: what a unit's `index.ts` may
  export (fixed in S1.2, S6.2 and S10 of `modular-monolith`) in `naming.md` (S8); a step's size
  estimated before it is planned (six steps over ~400 lines) in `/ticket-plan` (S5); Effect 4
  APIs checked against `repos/effect`, first in `effect.md` (S7).
- **Measuring** (D6): S1 writes the recipe into its findings; S3, S4 and S8 repeat it for their
  lever and record before, after and the cut in their findings. The `InstructionsLoaded` hook
  lives in the scratch worktree's `.claude/settings.local.json` and is never committed. Sessions
  run in `acceptEdits` with the file tools allowed, never `bypassPermissions` (S1). A lever
  under 20% where R15 asks for 20% is reported, not committed as done: the step cuts further or
  the user decides.
- A step that rewrites a `docs/knowledge/` page also trims every rule and `CLAUDE.md` line that
  restates it; after S5–S9 those are pointers already, so S10–S12 confirm it with `git grep`.
- `Makefile` recipes stay GNU Make 3.81 compatible; each new target gets a `## ` help comment and
  a `.PHONY` entry. `lychee` and `shellcheck` are not installed locally: links are checked by CI's
  `links` job, so a step that moves an anchor `git grep`s every link to it.
- **A step's `Files` is where it starts and what it must pin** (D15), not the bound of its edits:
  a named path, anchor or literal is pinned when it is a decided contract, a trap or a probe's
  target; every other file the change reaches is found by `git grep` at the step and listed in its
  report. A count or a list of hits written here was true at design time; the step re-finds
  it.
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Steps

#### S1 — The baseline

- **Delivers:** the numbers each lever is later held to, measured on the toolkit as it stands:
  what the reviewers of one step read of the ticket's design and of the rules, what the
  implementer reads or loads of the rules, what one session loads editing a domain file then a
  services file of a module, and what `/ticket-implement` loads on a one-step run. Each number
  comes with the exact recipe, so a later step measures the same way.
- **Goal:** a baseline taken before any lever lands (R15, D6).
- **Blocked by:** none.
- **Files:** `plan.md` (S1's findings: the recipe and the four numbers). Nothing else is committed.
- **Test first:** `config only` — the measuring seam (the `InstructionsLoaded` log and the agents'
  transcripts) itself.
- **Verify:**
  - A scratch worktree `lean-instructions-S1-replay` with `N=1`, created on a branch at
    `17c552af21^` (the parent of `modular-monolith`'s S34, a behaviour step, whose `plan.md`
    still has S34 `todo`; a branch, since the block renames it), set up by the block in
    `.claude/skills/ticket-implement/SKILL.md › Parallel steps`, with `.claude/` taken from the
    ticket branch's `HEAD` and the hook in `.claude/settings.local.json`.
  - R13: a headless `claude -p` session there runs the `implementer` agent on S34 of
    `docs/tickets/2026-10-31-0926_modular-monolith/`; the slice is the bytes and tokens of every
    rule it reads (transcript) or loads (hook log).
  - R12: S34's diff (`git diff 17c552af21^ 17c552af21`) applied uncommitted; the Standards and
    the Spec `reviewer` run on it with the brief `/ticket-implement` gives today; the slices are
    what each reads of that ticket's `architecture.md` and, for Standards, of `.claude/rules/`.
  - R14: one headless session reads and edits one `.ts` file of `application/chat/domain/`,
    then one of `application/chat/services/` (edits discarded); the slice is the rules and
    `CLAUDE.md` it loads.
  - R16: the size of the text a one-step `/ticket-implement` run loads (the skill's body).
  - Tokens counted one way throughout (state it: a tokenizer, else characters ÷ 4); the worktree,
    its containers and the hook are removed after (`make down`, `make reset`, `git worktree
    remove`); `git status --short` shows only `plan.md`.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - **Worktree.** A scratch worktree `lean-instructions-S1-replay` (`N=1`), on a branch at
    `17c552af21^`, set up by the block of `ticket-implement/SKILL.md › Parallel steps` (its
    `ln -sfn` line skipped: the folder already has the name, so it would link inside itself).
    `.claude/` is taken from the ticket branch's `HEAD` and committed on the scratch branch, so
    `git diff HEAD` shows only the replayed step: left staged, it made the main session send the
    reviewers to `git show HEAD:.claude/rules/…`, the old rules. Removed after, with its
    containers and branch.
  - **Hook.** `InstructionsLoaded` in the worktree's `.claude/settings.local.json` runs
    `jq -c '. + {logged_at: (now|todate)}' >> <log>`, one JSON line per input (`file_path`,
    `load_reason`, `trigger_file_path`, `agent_id` on a subagent's load).
  - **Sessions**, with the worktree as cwd, in the mode the *Measuring* line names:

    ```sh
    claude -p "$(cat <prompt>)" --permission-mode acceptEdits \
      --allowedTools "Bash Read Edit Write Glob Grep Agent Skill" \
      --output-format stream-json --verbose < /dev/null
    ```

    The prompts, verbatim:
    - R13: `You are the main session of /ticket-implement, step 2 only (Implement). Spawn the
      implementer agent (subagent_type "implementer", model "opus", effort "high") with this
      exact prompt: "Ticket folder: docs/tickets/2026-10-31-0926_modular-monolith/. Step: S34."
      Wait for its report and print it verbatim. Do nothing else.`
    - R12, on S34's diff applied uncommitted (its own `plan.md` and `architecture.md` edits left
      out, as approval makes them): `You are the main session of /ticket-implement for the
      ticket docs/tickets/2026-10-31-0926_modular-monolith/, step S34. The implementer has
      finished; its uncommitted step is the working tree. Read
      .claude/skills/ticket-implement/SKILL.md and perform its step 3 (Review) exactly as written
      for S34, with one exception: run only the Standards and Spec axes as reviewer sub-agents
      with the overrides its table gives. Skip the bug hunt, the silent-failure hunter, the Depth
      axis and simplify. Print the two reports. Edit nothing, commit nothing.`
    - R14: `Use only the Read and Edit tools. Read application/chat/domain/chat.model.ts, then
      append the line // probe after its last line; then the same for
      application/chat/services/chat.service.ts. Reply done.`
  - **Counting.** Reads come from each subagent's transcript
    (`~/.claude/projects/<cwd>/<session>/subagents/agent-<id>.jsonl`): every `Read`, `cat`,
    `sed`, `grep` or `git show` of a counted file, sized by rerunning the same command and
    counting its output. Loads come from the hook log; a subagent inherits `CLAUDE.md` and the
    unfiltered `commits.md` without a hook line, so both count as loaded. Project files only.
    Bytes by `wc -c`; tokens as characters (`wc -m`) ÷ 4, rounded (no tokenizer locally).
  - **R13 (the implementer on S34, `opus high`, 616 s, `make check` green).** It read no rule
    by tool. The filters loaded 13 rules: `commits` (at start), `sdd`, `claude-md`,
    `effect-schema`, `effect`, `deep-modules`, `comments`, `effect-tests`, `modules`,
    `effect-style`, `effect-services`, `naming` and `layering`; not `tooling` or
    `pull-requests`. **Baseline: 49 968 B, 12 452 tok.** Outside the slice: `CLAUDE.md`,
    `kernel/CLAUDE.md` and `application/CLAUDE.md`, 4 954 B, 1 233 tok.
  - **R12, two runs** (Standards on `sonnet`, Spec on `opus`):

    | | run 1 | run 2 | mean |
    |---|---|---|---|
    | Standards, ticket `architecture.md` read | 0 | 0 | **0** |
    | Spec, ticket `architecture.md` read | 3 294 B / 820 tok | 5 096 B / 1 268 tok | **4 195 B / 1 044 tok** |
    | Standards, rules read | 12 946 B / 3 224 tok | 5 328 B / 1 328 tok | 9 137 B / 2 276 tok |
    | Standards, rules loaded (`commits`) | 1 548 B / 387 tok | 1 548 B / 387 tok | 1 548 B / 387 tok |
    | **Standards, rules total** | 14 494 B / 3 611 tok | 6 876 B / 1 715 tok | **10 685 B / 2 663 tok** |

    The Spec reviewer finds the step's `D…` with `grep -n` and reads about 50 lines of the
    874-line file with `sed -n`. The Standards reviewer reads with `cat` alone, so no filter
    fires for it, and reads at most three of the rules `reviewer.md` lists (run 1: `effect-tests`,
    `comments`, `naming` whole; run 2: most of `effect-tests`, 10 grep lines of `naming`).
  - **R14.** The domain file loads `application/CLAUDE.md` and 9 rules (`deep-modules`,
    `effect-schema`, `modules`, `comments`, `effect`, `effect-style`, `layering`, `naming`,
    `effect-services`); the services file loads nothing new. With `CLAUDE.md` and `commits.md`
    from the start: **baseline 41 921 B, 10 451 tok** (rules 38 245 B / 9 536 tok, `CLAUDE.md`
    files 3 676 B / 915 tok).
  - **R16.** `/ticket-implement` loads `SKILL.md` without its front matter, a fixed text:
    **8 814 B, 2 202 tok**. `## Parallel steps`, which a one-step run does not need, is
    3 745 B, 936 tok (42% of the body).
  - Where the baseline contradicted the requirements:
    - R12's row asks each reviewer's reading of the design to drop by 20%; the Standards
      reviewer reads none of it.
    - R12's row also asks the Standards reviewer's rule reading to drop by 20%, while R12 hands
      it every unfiltered rule and every rule whose filter matches the diff; today it reads at
      most three, so the lever would raise that reading, not cut it.
    - The reviewers' slices vary between runs (Standards 1 715 and 3 611 tok); D6 says the
      slice a lever targets does not.
    - R13 assumed the implementer reads every rule up front; it reads none, so R13's cut can
      come only from shorter rule text (S7, S8), and no step measures R13 after them.
    - Settled on the user's word (2026-11-03): R12's design cut applies to the Spec reviewer and
      is the mean of two runs; the Standards reviewer is held to citing every rule that binds its
      files, not to a cut; R13 asks for the file tools and S8 reruns it beside R14 (D6's note).

#### S2 — Names across every doc, and every filter matching

- **Delivers:** `make doc-names` reads every Markdown file outside the ticket folders, the vendored
  repos and the roadmap, so a skill, an agent, a `README.md` or the PR template that names a
  missing path or name fails the gate. In an instruction file it also refuses a concrete source
  path (`<dir>/<file>.ts`), which a pattern with a placeholder, a package specifier or a doc
  pointer replaces. `make rule-paths` fails on a rule whose `paths:` filter matches no file. The
  decisions page records why instruction files name patterns.
- **Goal:** the checks of names and filters (R7, R8, R9, D3).
- **Blocked by:** none.
- **Files:** `Makefile` (`DOC_NAMES_IN` widened to `'*.md'` minus `docs/tickets`, `repos` and the
  roadmap; `SendMessage` into `DOC_NAMES_ABSENT`; the source-path pattern over the instruction
  files; new `rule-paths` over the `paths:` of `.claude/rules/*.md`, skipping a rule without one,
  with `git ls-files --cached --others --exclude-standard ':(glob)<filter>'`; both in `check`
  and the `.PHONY` list);
  `.github/workflows/ci.yml` (the links job runs `make rule-paths`); every instruction file the
  new pattern flags on the clean tree (two at design time) names a pattern or a pointer instead;
  `docs/knowledge/decisions.md` (new record **Instructions name patterns** under *Guards, tests
  and history*, with the seven fields its intro requires); `docs/knowledge/tooling.md › Commands`
  (the rows of `doc-names` and `rule-paths`, the `check` row) and `› Git hooks and CI`;
  `.claude/rules/claude-md.md` (the pattern bullet names both targets).
- **Test first:** the checks seam — probes, each red then reverted: a missing path in a skill, an
  agent and a `README.md` (`doc-names` names file and line); a `<dir>/<file>.ts` span with no
  root folder (as `shared/tags.ts` was) in a rule, a
  `CLAUDE.md` and a skill (refused), while `<module>/<name>.ts`, `@app-template/kernel/data` and
  `docs/knowledge/aws.md` pass; a rule filter narrowed to a missing folder, and one with braces
  (`rule-paths` names rule and filter).
- **Verify:** `make check`; each probe above red, then green once reverted.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - The clean tree's two hits were the ones named; they now name a helper or nothing, and
    `SendMessage` joined `DOC_NAMES_ABSENT`, the only new miss once the skills were read.
  - S1's note on `claude-md.md` does not hold: `docs/knowledge/**` is one of its filters, and
    every filter of every rule matches files.
  - `rule-paths` reads a filter as a list item, an inline list or a scalar, and every rule under
    `.claude/rules/`, subfolders included (the bug hunt found a scalar or inline filter skipped);
    the reader prints the same pairs under BSD awk and CI's `mawk` 1.3.4.
  - A span starting with `@` is a package specifier and passes, not only `@app-template/`.
  - Simplify: the awk's two substitutions and the `tr`/`sed` stages joined; `rule-paths` ends in
    the shape `doc-names` does. Kept: one `git ls-files` per filter (git's own glob, ~0.8 s), and
    the `filters` variable, so an `awk` failure exits 2.
  - Review: `tooling.md` and the record point to the comment above the target instead of
    restating the pattern; the `.PHONY` line wraps at 100.
  - Left open: only `.ts`, `.tsx` and `.json` count as source files, as D3 decided; a span with a
    suffix (`<path>.ts › <name>`) passes; the record links into `docs/tickets/`, as older
    records do. S3 matches rules to a diff by their filters, so it may lift the front-matter
    reader into a target of its own rather than parse `paths:` twice.

#### S3 — Reviewers and the implementer read less

- **Delivers:** `/ticket-implement` gives each reviewer the design parts the step's own lines
  name (its `D…` ids, Seam row and Contracts entries) and the Standards reviewer the rules without
  a filter plus those whose filter matches a file of the diff; the reviewer reads only those. The
  implementer no longer reads every rule at the start: the rules arrive as it reads files, and it
  reads a file of a folder before writing a new file there, reading and editing through the file
  tools (S1: under `bypassPermissions` an agent edits through Bash and no path filter fires). The
  replayed step shows each cut against the baseline.
- **Goal:** less reading per step, the same rules applied (R12, R13, R15, D2, D7).
- **Blocked by:** S1.
- **Files:** `.claude/skills/ticket-implement/SKILL.md` (step 3: the brief), `.claude/agents/reviewer.md`
  (what it reads; its list of rules read from disk goes), `.claude/agents/implementer.md` (*Read
  the step* and *The repo's rules* disciplines), `.claude/skills/ticket-verify/SKILL.md` if its
  review brief relies on the reviewer reading every rule, `docs/knowledge/sdd.md` (the
  dependency map and *The approval gate*, where the reading changes); found at the step: the
  `Makefile` and `docs/knowledge/tooling.md` (`make review-rules`).
- **Test first:** the measuring seam — S1's R12 replay rerun twice with the new toolkit; red is a
  mean cut under 20% on the Spec reviewer's design reading, or a Standards report that misses a
  rule whose filter matches a file of the diff.
- **Verify:** `make check`; the Spec cut recorded in the findings, ≥ 20%; the Standards
  reviewer's report on the replayed diff cites every rule that binds its files (compared with the
  baseline report); `implementer.md` has the agent read and edit through the file tools.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - **Recipe:** S1's (worktree `lean-instructions-S3-replay`, `N=1`, at `17c552af21^`, the
    prompt and command verbatim, `acceptEdits`, counting as S1), with three differences:
    `17c552af21^` has no `make review-rules`, so the scratch commit of `.claude/` also appends
    the target and its reader to the `Makefile`; `.claude/` comes from the uncommitted toolkit
    (tracked and untracked files, ignored ones left out); the hook takes its log path from
    `S3_LOG`. Two pairs of runs: a, b on D2's wording; c, d on the narrowed brief. Removed
    after, with its branch; no `local1` container was left.
  - **R12, the Spec reviewer's reading of the ticket's `architecture.md`:**

    | | run 1 | run 2 | mean |
    |---|---|---|---|
    | baseline (S1) | 3 294 B / 820 tok | 5 096 B / 1 268 tok | 4 195 B / 1 044 tok |
    | D2's wording (a, b) | 5 683 B / 1 415 tok | 4 576 B / 1 141 tok | 5 130 B / 1 278 tok (+22%) |
    | **narrowed (c, d)** | 1 498 B / 373 tok | 3 494 B / 869 tok | **2 496 B / 621 tok (−40%)** |

    Deviation (D2's note): "its Contracts entries of its files" got the reviewer D11, D14, D19,
    two Seam rows and three Contracts entries for a step citing D11 alone; the brief now names
    only what the step's own lines name.
  - **R12, Standards:** each of the four reports names all 13 rules `make review-rules` lists
    for the diff; the baseline report named 3. Given the list alone (a, b), the reviewer opened 2
    and 4 of them and wrote `none` for the rest unread; told to read each whole (c, d), it read
    all 13: 51 708 B / 12 887 tok with `commits.md`, against 10 685 B / 2 663 tok (×4.8), the
    cost D6's note accepted. R13 is not measured here: S8 reruns it.
  - Deviation: `make review-rules` lists the rules instead of the skill matching them, over the
    `paths:` reader lifted from `rule-paths` into `RULE_FILTERS` (S2's note); it is not in
    `check`. `Makefile` and `tooling.md` join the step's files; `ticket-verify/SKILL.md` stays,
    since its brief lists the rules itself. `git grep` found the *Guarded by* line in
    `decisions.md` that said the Standards reviewer reads `.claude/rules/`.
  - Simplify, done by the main session: nothing to cut in the target.
  - Review: the narrowing had cut the Depth reviewer's sources and clashed with `/ticket-verify`'s
    whole-file brief, so "read no more" binds the sources the brief names, Depth names
    `deep-modules.md`, the architecture page and the records, and simplify gets the same rule
    list as review; the reviewer reads each file with `Read`, one per call (run d had cited lines
    of the harness's saved output); a new folder's rules come from a sibling folder's file.
  - Left open: a rule with an empty or unparsed `paths:` list counts as unfiltered; a rule's own
    filter decides where it binds, so `deep-modules.md` and `layering.md` reach no diff outside
    `application/`, `apps/` and `kernel/`, for the implementer and the reviewer alike.

#### S4 — Parallel steps on demand

- **Delivers:** `/ticket-implement` keeps one line for steps run in parallel, pointing to a file
  beside it that holds today's procedure; a one-step run no longer loads it. The worktree setup
  that the skill printed as a shell block runs as a `make` target over a script in the skill's
  folder, with the same refusals and the same `.env` it writes today.
- **Goal:** the skill loads only what its run needs (R16, R15, D9).
- **Blocked by:** S3.
- **Files:** `.claude/skills/ticket-implement/SKILL.md` (the *Parallel steps* section becomes one
  pointer), new `.claude/skills/ticket-implement/parallel-steps.md`, new
  `.claude/skills/ticket-implement/worktree.sh`, `Makefile` (new `worktree` target, `.PHONY`,
  `help`), `docs/knowledge/tooling.md › Worktrees` (the target, the ports table kept as owner)
  and `› Commands`, `docs/knowledge/sdd.md` (the map: the skill's supporting file and script).
- **Test first:** the worktree seam — in a scratch worktree, `make worktree N=1 NAME=<name>` writes
  the same `.env` lines (`API_PORT`, `WEB_PORT`, the port of `AWS_ENDPOINT_URL`, `STAGE`,
  `RDS_BASE_PORT`), symlink and branch name as the old block run on another scratch worktree; red
  until the script exists; `N=0` and a run in the main tree are refused as before.
- **Verify:** `make check`; the comparison above; the R16 slice measured as in S1 and the cut
  (≥ 20%) recorded; `shellcheck` on the script if installed.
- **Model:** `opus high`
- **Status:** todo

#### S5 — One commit gate; skills and agents as patterns

- **Delivers:** the commit gate is stated once, in the SDD rule: at its first step of a session
  `/ticket-implement` asks once whether ready steps commit without the user's OK, and holds the
  answer; a step is ready when its reviews ran, their fixes are in and `make check` is green;
  pushing, a PR and a merge always wait. Every other place that tells it points to it. The skills and agents
  name patterns and owners instead of instances, and `/ticket-plan` asks for a size estimate per
  step.
- **Goal:** one gate that matches the practice; instruction files that survive a refactor (R17,
  R1–R3, R5, D8).
- **Blocked by:** S4.
- **Files:** `.claude/rules/sdd.md › Gates` (the owner), and the places that tell the gate today:
  `.claude/rules/commits.md`, `.claude/rules/pull-requests.md` (the push half),
  `.claude/rules/claude-md.md` (also its toolkit section cut to what `docs/knowledge/sdd.md` does
  not hold), the last line of each of the five `.claude/skills/ticket-*/SKILL.md` and, in
  `ticket-implement`, its description and steps 4–5, `.claude/agents/implementer.md`
  (description and *The working tree is your output*), `docs/knowledge/sdd.md` (the five skills'
  table, *The approval gate* and the lines that retell it); `.claude/skills/ticket-plan/SKILL.md`
  (the size estimate); `.claude/skills/ticket-implement/parallel-steps.md`,
  `.claude/agents/{reviewer,verifier,researcher}.md` (patterns).
- **Test first:** `config only` — the gate seam: `git grep -n` of the gate's wording over
  `.claude/` and `docs/knowledge/` finds one statement and pointers; a new session's first
  `/ticket-implement` step asks once and its second step does not (checked by hand on the next
  real step, recorded in that step's findings).
- **Verify:** `make check`; the grep above; the ledger.
- **Model:** `opus medium`
- **Status:** todo

#### S6 — Agents that do their own job

- **Delivers:** each agent's file says what it reads and what it leaves to the main session, so
  the briefs stop repeating it: the verifier reads the requirements, their acceptance and the
  design's contracts, not the plan; no reviewer reports an edit only the main session makes; the
  implementer never stashes, checks out, commits or runs `/simplify`. Every report is written in
  English for the main session, without the user's status block. `/ticket-implement` runs
  `/simplify` itself before the review, gives Standards the binding rules and Depth the shape,
  and runs one hunt pass for bugs and silent failures only on a step that touches a write guard,
  a transaction, a test fake, concurrent access or error handling. The main session decides on
  the reports and forwards accepted findings by `path:line` instead of reading the code itself;
  every reviewer writes a finding in one shape. `/ticket-verify` runs one verifier per group of
  requirements in parallel and merges their verdicts.
- **Goal:** each pass does its own job, once; the main session orchestrates; verification is
  faster (R18–R22, D10–D14).
- **Blocked by:** S5.
- **Files:** `.claude/agents/implementer.md`, `.claude/agents/reviewer.md` (also the finding's
  shape), `.claude/agents/verifier.md` (also one group per run), `.claude/agents/researcher.md`,
  `.claude/skills/ticket-implement/SKILL.md` (step 2: `/simplify` by the main session; step 3: the
  axes' split, the Spec note, the hunt's condition and its one brief; steps 4–5: the main session
  decides on reports and forwards findings), `.claude/skills/ticket-verify/SKILL.md` (verifiers
  per group of requirements, in parallel; the merge), `docs/knowledge/sdd.md` (the
  dependency map, the overrides table and *The approval gate*: who runs `/simplify`, the one hunt
  pass and its condition).
- **Test first:** `config only` — the seam is the next real steps and verification, read in their
  transcripts (R18–R20); this step's report quotes each new line and the brief it replaces.
- **Verify:** `make check`; `git grep -n 'simplify'` over `.claude/agents/` finds only the
  implementer's prohibition; `git grep -n 'plan.md'` over `verifier.md` and `ticket-verify`'s
  verifier brief finds no read of it; the ledger.
- **Model:** `opus medium`
- **Status:** todo

#### S7 — The Effect rules trimmed

- **Delivers:** the rules that load on every `.ts` file and are about Effect (the map, style,
  services, schemas, tests) and the comments rule keep only what Claude would get wrong: default
  Effect style it writes unprompted goes, a rule a `make` target enforces goes, and a fact another
  file owns becomes a pointer. The first line of the Effect map says, in plain words, to check
  every API against `repos/effect`, not memory of Effect 3. Every rule is at most 80 lines.
- **Goal:** less text per `.ts` edit, every constraint kept (R14, R3, R2, R5, D1, D4).
- **Blocked by:** S1, S6.
- **Files:** `.claude/rules/{effect,effect-style,effect-services,effect-schema,effect-tests,comments}.md`;
  every link to a file or an anchor the step renames or drops, until `git grep` of the six file
  names over `.claude/`, the `CLAUDE.md` files, `README.md`, `Makefile` and `docs/knowledge/`
  finds only live targets.
- **Test first:** `config only` — the ledger is the seam; R14's measurement waits for S8, which
  trims the rest of the set.
- **Verify:** `make check`; `wc -l` of each rule ≤ 80; `git grep -n 'nested-calls'` over the rules
  finds only a pointer; the ledger.
- **Model:** `opus high`
- **Status:** todo

#### S8 — Naming, layering, modules, deep modules trimmed

- **Delivers:** the file table of the naming rule keeps the suffix and its role, and its hidden
  constraints move to the rule of their layer; what a unit's `index.ts` may export is stated
  there. The layering and modules rules stop covering one subject twice: use cases, handlers and
  repositories are told once. The deep-modules rule keeps one example per idea. Facts the
  kernel's `CLAUDE.md`, `tooling.md › Tests` or `database.md › Guards` own become pointers. A
  session editing a domain file then a services file loads at least 20% less than the baseline.
- **Goal:** the cut on a module's `.ts` edit and on the implementer's load (R14, R13, R15, R3,
  R2, R5, D1).
- **Blocked by:** S7.
- **Files:** `.claude/rules/{naming,layering,modules,deep-modules}.md` (a merged or renamed rule
  keeps one file per subject); every link to a file or an anchor the step renames or drops,
  until `git grep` of the four file names over `.claude/`, the `CLAUDE.md` files, `README.md`,
  `Makefile` and `docs/knowledge/` finds only live targets.
- **Test first:** the measuring seam — S1's R14 session and R13 replay rerun; red while the rules
  and `CLAUDE.md` loaded, or the implementer's load, are not ≥ 20% under the baseline.
- **Verify:** `make check` (`rule-paths` green on the changed filters); `wc -l` of each rule ≤ 80;
  the R14 and R13 cuts recorded, and the implementer's transcript edits through the file tools;
  the ledger names every constraint's new home.
- **Model:** `opus high`
- **Status:** todo

#### S9 — `CLAUDE.md` files, process rules, size limits

- **Delivers:** the root and workspace `CLAUDE.md` files name patterns and point to the owners:
  the rings to `architecture.md`, the dependency command to `tooling.md`, the resource naming to
  `aws.md › The inventory`, versions to the manifests; the kernel's `CLAUDE.md` owns the data layer's types rule.
  The process rules (tooling, PRs, commits) keep only what they own. The maintenance rule states
  the test, the owner, the pattern and the limits line, and names the three checks; `make
  doc-limits` reads that line and fails on a `CLAUDE.md` over 40 lines or a rule over 80.
- **Goal:** instruction files that survive a refactor, checked for size (R1–R5, R10, R11, D5).
- **Blocked by:** S8.
- **Files:** `CLAUDE.md`, `{application,apps,deployment,http-api,kernel,packages}/CLAUDE.md`,
  `.claude/rules/{tooling,pull-requests,commits,claude-md}.md`, `Makefile` (new `doc-limits`,
  `check`, `.PHONY`), `.github/workflows/ci.yml` (links job), `docs/knowledge/tooling.md ›
  Commands` and `› Git hooks and CI`.
- **Test first:** the checks seam — probes, each red then reverted: a rule grown to 81 lines and a
  `CLAUDE.md` to 41 (`doc-limits` names file and length); the limits line reworded (exit 2,
  naming the line it expects).
- **Verify:** `make check`; the probes; the owners table of `architecture.md` checked row by row
  with `git grep` over the instruction files; the ledger.
- **Model:** `opus high`
- **Status:** todo

#### S10 — The architecture page, the README and the glossary

- **Delivers:** `architecture.md` owns the rings and which folder holds what; `README.md` and the
  glossary point to it instead of retelling. Live paths, counts, versions and lists of what
  exists stay only where their doc owns them; a line stays only where a reader would go wrong or
  search long without it. What a ring may import is stated once, in the dependency matrix, and
  the guard table, Known gaps and `decisions.md` point to it; Known gaps lists only import forms
  under its lead (the review of `modular-monolith`'s S43 found both).
- **Goal:** human docs with one owner per fact (R2, R4, R6).
- **Blocked by:** S9.
- **Files:** `docs/knowledge/{architecture,glossary}.md`, `README.md`; any rule or `CLAUDE.md`
  line still restating them (`git grep`).
- **Test first:** `config only` — the R4 greps (`\b[0-9]+\.[0-9]+\.[0-9]+\b`, "today", counts)
  over these files, each hit in its owner only.
- **Verify:** `make check`; the greps; the ledger.
- **Model:** `opus high`
- **Status:** todo

#### S11 — Tooling, AWS, database and AI pages

- **Delivers:** `tooling.md` owns versions' pointer to the manifests, the test layout, the
  dependency command and the worktree ports; `aws.md › The inventory` the resource naming; `database.md` the
  guards; each other page points. The PR template and example name patterns. The local stand's
  `README.md`, which only retells `aws.md`, is gone.
- **Goal:** human docs with one owner per fact; no doc that only retells (R2, R4, R6).
- **Blocked by:** S9.
- **Files:** `docs/knowledge/{tooling,aws,database,ai}.md`, `.github/PULL_REQUEST_TEMPLATE.md`,
  `.github/PULL_REQUEST_example.md`, `deployment/local/README.md` (deleted; nothing links to it).
- **Test first:** `config only` — the R4 greps over these files, each hit in its owner only.
- **Verify:** `make check`; the greps; the ledger.
- **Model:** `opus high`
- **Status:** todo

#### S12 — Decisions, the SDD guide and the move probe

- **Delivers:** `decisions.md` keeps the why, the cost and the guard of each record, pointing to
  the owners for live names; the SDD guide keeps what the skills do not say. The roadmap marks
  `docs-diet` done. A probe that moves a module's folder and renames a file in it needs no edit to
  any instruction file.
- **Goal:** the last human docs, and proof that a refactor needs no doc edit (R1, R2, R4, R6).
- **Blocked by:** S10, S11.
- **Files:** `docs/knowledge/{decisions,sdd,roadmap}.md`.
- **Test first:** the move-probe seam — `application/chat` moved to a scratch name and one of its
  files renamed: `git grep` of the old names over the instruction files finds none and `make
  doc-names` stays green; reverted.
- **Verify:** `make check`; the probe; the R4 greps over `docs/knowledge/` and every `README.md`;
  `/doctor prompt-audit` run by hand, its findings in the step's report.
- **Model:** `opus medium`
- **Status:** todo

#### S13 — Ticket artifacts that pin only what a step needs

- **Delivers:** the plan template and `/ticket-plan` ask each step for its outcome, its
  constraints, the paths and names it must pin (a decided contract, a trap, a probe's target) and
  a check that names the state it fails on, one probe per guard a step replaces (lesson L8 of
  `modular-monolith`); every other file the step reaches is found by `git grep` at the step
  and listed in its report, so a step no longer lists every suite and doc. The design template and
  `/ticket-architecture` have a design entry state its decision and invariant and link the config
  that holds it instead of copying it. The requirement template and `/ticket-feature` extend the
  rule that a requirement names no path to its acceptance row. `/ticket-plan`'s `Exists` and
  `Conforms` checks keep reading what a step still pins.
- **Goal:** ticket artifacts that a rename or an equivalent approach leaves true (R23, D15).
- **Blocked by:** S5 (it edits `/ticket-plan` and each skill's last line), S12 (it trims
  `docs/knowledge/sdd.md`).
- **Files:** `docs/tickets/_template/{feature,architecture,plan}.md`,
  `.claude/skills/ticket-{feature,architecture,plan}/SKILL.md`; `docs/knowledge/sdd.md` where it
  retells what a step lists; the evidence is `research.md`.
- **Test first:** `config only` — the ledger is the seam: each removed or changed instruction with
  its new home, each new line with the `research.md` finding it rests on.
- **Verify:** `make check`; `git grep -n 'every suite'` over `.claude/skills/` finds no demand for
  an exhaustive list; the plan template's `Verify` line asks for the state each check fails on.
- **Model:** `opus medium`
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S5, S9, S12 |
| R2 | S5, S7, S8, S9, S10, S11, S12 |
| R3 | S5, S7, S8, S9 |
| R4 | S10, S11, S12 |
| R5 | S5, S7, S8, S9 |
| R6 | S10, S11, S12 |
| R7 | S2 |
| R8 | S2 |
| R9 | S2 |
| R10 | S9 |
| R11 | S2, S9 |
| R12 | S1, S3 |
| R13 | S1, S3, S8 |
| R14 | S1, S7, S8 |
| R15 | S1, S3, S4, S8 |
| R16 | S1, S4 |
| R17 | S5 |
| R18 | S6 |
| R19 | S6 |
| R20 | S6 |
| R21 | S6 |
| R22 | S6 |
| R23 | S13 |
