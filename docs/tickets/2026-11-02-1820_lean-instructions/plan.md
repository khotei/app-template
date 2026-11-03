# Lean instructions — plan

> Ticket: `2026-11-02-1820_lean-instructions` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | the baseline: what each lever's target loads today | done |
| S2 | `doc-names` over every doc, refusing a source path in an instruction file; `rule-paths` | done |
| S3 | reviewers read only the cited design and the matching rules; the implementer reads no rule up front | done |
| S4 | parallel steps read on demand; the worktree setup a script | done |
| S5 | the commit gate in one place, asked once per session; skills and agents as patterns | done |
| S6 | agents do only their own part; the main session orchestrates on reports; one hunt pass by condition; `/simplify` from the main session; parallel verifiers | done |
| S7 | the Effect rules and the comments rule trimmed; the Effect-4 trap first | done |
| S8 | naming, layering, modules and deep modules trimmed, one file per subject | done |
| S9 | every `CLAUDE.md` and the process rules as patterns; `doc-limits` | done |
| S10 | `architecture.md`, `README.md` and the glossary own only their facts | done |
| S11 | tooling, AWS, database and AI pages own only their facts; the local stand's `README.md` gone | done |
| S12 | decisions and the SDD guide trimmed; `docs-diet` done; the move probe | done |
| S13 | the ticket templates and the planning skills pin what a step needs and leave the rest to a grep | done |
| S14 | verification run 1 and the prompt audit fixed: two stale doc lines, two recorded exceptions, a contradiction, findings presented one block each | done |
| S15 | lessons L2–L5 of verification run 1: briefs name sources only, results quote their output, a behaviour step is one that changes code; plugins that overlap the skills off | done |
| S16 | a named function is a `function` declaration; an arrow is a callback or an expression body | done |
| S17 | verification run 2 fixed: the skill back under its cut, one round rule, lessons L6–L9, `doc-names` safe in parallel | done |
| S18 | the Effect-style checks are Biome rules; the bundle check stops on a failed `grep` | done |
| S19 | the doc checks are `markdownlint-cli2` rules; the names and ids checks gone | todo |

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
- **Status:** done
- **Findings:**
  - **R16, the text a one-step `/ticket-implement` run loads** (the skill's body without front
    matter, `wc -c`, characters ÷ 4, as S1): **before 8 814 B / 2 202 tok** (S1; 9 440 B /
    2 357 tok at S3's commit), **after 5 821 B / 1 455 tok, a cut of 34%**. A parallel run also
    reads `parallel-steps.md`, 2 357 B / 589 tok.
  - **The worktree seam:** the old block (from `SKILL.md` at S3's commit) and `make worktree` on
    two scratch worktrees at N=1, then N=2: the same `.env` (`diff` empty), the symlink `<name>`
    beside the folder and the branch `wt/<name>`; red before the script, and red on a planted
    wrong port. After the review round, rerun at N=2: only the five lines move. Refusals as
    before: `N=0`, the main tree, a main `.env` without `STAGE` (in a scratch repo, nothing
    written). No container started.
  - Beyond the block: every check runs before the first change, so a refusal leaves no link,
    branch or `.env`; it refuses an `N` with a leading zero (shell arithmetic reads it as
    octal), a `NAME` outside letters, digits, `.` and `-`, a link of that name to another
    folder and an existing `wt/<name>` branch; it links nothing when the folder already has the
    name (S1's note). `make` hands `N` and `NAME` to the script through the environment, so a
    quote in a value cannot reach the shell. The ports are computed once for writing and
    checking.
  - Review: the pointer to `parallel-steps.md` moved to the skill's head, since a parallel run
    changes steps 2 and 5. Kept: the script in the skill's folder (D9), though `make` now
    reaches into `.claude/`; a `NAME` exported by the shell (WSL sets one) still fills a missing
    `NAME=`, and the pattern check is the only guard.
  - `shellcheck` is not installed; not run.

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
- **Status:** done
- **Findings:**
  - **The gate seam:** `git grep -n -i` of the gate's wording (`approv`, `explicit OK`, `user's
    OK`, `own OK`, `commit gate`) over `.claude/`, `docs/knowledge/`, the `CLAUDE.md` files and
    `docs/tickets/_template` finds the statement once, `sdd.md › Gates`, and pointers elsewhere;
    the other hits are a lesson applied on the user's OK and the user confirming an artifact. A
    planted retelling in a skill folder was found, then removed. **R17's by-hand half** (a new
    session's first `/ticket-implement` step asks once, its second does not) is checked on the
    next step run in a new session and recorded in its findings.
  - Ledger: every retelling became a pointer (`commits.md`, `pull-requests.md`, the five skills'
    last lines, `ticket-implement`'s description, head and step 5, `implementer.md`,
    `parallel-steps.md`, `docs/knowledge/sdd.md`); dropped from `claude-md.md › The toolkit`,
    held by `docs/knowledge/sdd.md`: plugin skills by name, wrappers override paths and gates,
    subagents cannot ask, `disable-model-invocation`, the implementer's end on `make check` or
    `BLOCKED:`; dropped, Claude gets it right without it: a plugin is never edited, and
    "one step, or one round of it, per commit", which `sdd.md › Gates` holds. `researcher.md` and
    `reviewer.md` name owners (`make check`, the registry, the installed package) for tools.
  - Trap placed (R5): `/ticket-plan` estimates a step's **Size** over every file the change
    reaches, tests and docs included, and splits one over ~400 lines before presenting.
  - Deviations: `docs/tickets/_template/plan.md` (outside Files, found by the gate grep) points
    to the gate and gains the `Size:` line; `docs/knowledge/sdd.md › The approval gate` is now
    *The commit gate* (no link pointed to the old anchor; S6's Files still name the old title);
    the gate also covers a step's rounds and lets every other artifact commit once confirmed in
    its skill (D8's note).

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
  dependency map, the overrides table and *The commit gate*: who runs `/simplify`, the one hunt
  pass and its condition).
- **Test first:** `config only` — the seam is the next real steps and verification, read in their
  transcripts (R18–R20); this step's report quotes each new line and the brief it replaces.
- **Verify:** `make check`; `git grep -n 'simplify'` over `.claude/agents/` finds only the
  implementer's prohibition; `git grep -n 'plan.md'` over `verifier.md` and `ticket-verify`'s
  verifier brief finds no read of it; the ledger.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - Verify: `git grep -n 'simplify'` over `.claude/agents/` hits only the implementer's line that
    the main session runs it and the prohibition; `git grep -n 'plan.md'` over `verifier.md` hits
    only "stays closed", and `ticket-verify`'s hits are the main session's Lessons and fix steps.
    Each grep went red on a planted line, then the file was restored. The transcript half of
    R18–R20 is read on the next real steps and verification and recorded there.
  - Ledger: each agent's file now says what it reads, what it leaves to the main session and that
    its report is in English for the main session without the status block; the implementer's
    prohibitions (commit, push, `gh`) gain stash, check-out, `/simplify` and editing `plan.md` or
    `architecture.md`, so `parallel-steps.md` no longer repeats the last; the reviewer's "cite
    everything, label hard or judgement" became the one finding shape, which Depth uses too with
    its mark after the fix; the verifier reads its group, their acceptance rows, `architecture.md ›
    Contracts` and the Seams rows they name, never `plan.md`.
  - Deviations: the hunt is a `reviewer` briefed for bugs and silent failures together, with the
    diff's files, their callers and a fake's real adapter as sources, replacing the built-in
    `code-review` and `silent-failure-hunter` (Contracts › the passes); the hunt's condition is
    R19's list alone, without the old "a store outside the transaction"; verification groups
    follow `feature.md`'s `###` sections, and the requirements that start the apps, run the e2e
    or write a probe form one group that alone runs `make check` (D14's note).
  - Review: `parallel-steps.md` (outside Files) dropped its order to leave `plan.md` alone; the
    reviewer's Spec pass names verification's whole `feature.md`; the map's `reviewer` row names
    the hunt.

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
- **Status:** done
- **Findings:**
  - The six rules: 365 → 320 lines, 22 494 → 18 081 B (−20%); each ≤ 80 lines (effect 34,
    effect-style 80, effect-services 53, effect-schema 39, effect-tests 75, comments 39). R14's
    token measurement runs in S8.
  - Verify: `git grep -n 'nested-calls'` over the rules finds only the pointer in
    `effect-style.md › Composition`; `effect.md` opens with the Effect-4 trap in plain words.
  - Ledger, moved: the repository write `update(set, where)` to `deep-modules.md` (loads where
    repositories live); a port's contract stated once, to `comments.md`; `Arr.append` and
    `Arr.getSomes` to `effect.md`'s native-code line; the harnesses, the recorders' list and "a
    plainer test, not a helper" to `tooling.md › Tests` behind a pointer at the head of
    `effect-tests.md`; the memory guards to `database.md › Tests`; `<Port><Variant>` to
    `naming.md`. Dropped as default style or a reason only: the reasons after the constraints,
    the instance examples, "decode untrusted input with a schema", `drizzle-orm/effect-postgres`
    being thinly documented, an arrow for a one-step function; `recordQueue()` and
    `recordAssistant()` by name, found in their module's `testing` barrel.
  - Review: three drops came back, each an Effect-4 habit no check holds — `Service.use` /
    `useSync` in its positive form (`make service-use` flags only a service mapped over, so
    `Service.pipe(Effect.flatMap(…))` passes), "never `Effect.Do`" (still in Effect 4), and
    "`.value` only under a narrowing guard"; `effect.md` said `make idioms` catches `??`, which it
    does not. `tooling.md`'s rows stay as they were: the rule text lives in the rule.
  - D4 read as covering every bold lead-in in the six files, not only `**Required:**` marks.
  - Out of scope, for S8: `effect.md` and `effect-style.md › Branching` both name `Match` and
    `Predicate`; `deep-modules.md`'s "a copy per model is one function over the varying part"
    overlaps the `sumBy` rule.


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
- **Status:** done
- **Findings:**
  - The four rules 19 391 → 13 530 B (−30%), 59 to 66 lines each.
  - **R14** (S1's session, worktree `lean-instructions-S8-replay`, `N=1`): the same 9 rules and
    two `CLAUDE.md` load, **32 544 B / 8 109 tok against 41 921 B / 10 451 tok, −22.4%**.
  - **R13** (the implementer on `modular-monolith` S34, 621 s): the same 13 rules load, none read
    by tool, **39 851 B / 9 926 tok against 49 968 B / 12 452 tok, −20.2%**; the margin is
    about 25 tok, so a run loading one more rule would miss. Its transcript edits through Edit
    and Write (30 Read, 44 Edit, 3 Write), but its Bash also ran `git rm`, a temp log and about
    12 file reads (`cat`, `sed -n`, `head`), which `implementer.md` forbids (verification run 1,
    R13). Both counts
    include the review's last edits (+23 B, measured before them).
  - The worktree was made with the main tree's `make -f <main>/Makefile worktree`, as
    `17c552af21^` has no `worktree` target.
  - Ledger: the naming table's hidden constraints moved to `layering.md` (`.id`, `.port`,
    `.model`, handlers) and `kernel/CLAUDE.md` (`.table`); which folder holds what to
    `architecture.md`; the handler's refusal of a repository, mapper or data layer from
    `modules.md` to `layering.md`, since `modules.md` never loads under `apps/`, where handlers
    live, so `decisions.md` and `architecture.md` name both rules where they named `modules.md`
    alone; concurrency, the field mappers and the transaction's test layer to pointers at
    `database.md` and `tooling.md`. Dropped: `git log -S`, an instance (`generateId`), a reason
    ("do not wait for the method to grow"), and the extra status-vocabulary examples.
  - Trap placed (R5): a unit's `index.ts` only re-exports, and e2e support sits behind its own
    entry, in `naming.md › Imports`.
  - Review: the constants line, lost, is back under *Symbols*; the trap names a unit's
    `index.ts`, since the Pulumi programs' `index.ts` hold code; `make check`, not `make lint`,
    refuses a deep import.
  - Left open: `packages/ui/index.ts` holds code (`joinClassNames`), against the new trap;
    `effect.md` and `effect-style.md` both name `Match` and `Predicate` (S7 left it, neither is
    in S8's files); `architecture.md` still restates the handler's refused list (S10).

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
- **Status:** done
- **Findings:**
  - `make doc-limits` reads its two numbers from the limits line of `claude-md.md`: red with the
    line missing or reworded (exit 2, naming the line it expects), red on a rule at 81 lines and
    a `CLAUDE.md` at 41, tracked or untracked and nested (exit 1, naming file and length), green
    on the tree. `effect-style.md` sits at 80.
  - Line counts: root `CLAUDE.md` 28, the workspaces' 9 to 21; `claude-md.md` 71.
  - Ledger: the root's folder map, its `apps/e2e` note and "TypeScript 7" go to
    `architecture.md`, `apps/CLAUDE.md` and the manifests; resource naming to `aws.md › The
    inventory`; one PR per ticket to `sdd.md › Gates`; `application/CLAUDE.md`'s contract line
    to `modules.md`, which loads on the same files. `claude-md.md` regrouped under the test, the
    owner, the pattern, the limits and the checks; nothing dropped there.
  - `apps/CLAUDE.md`, `http-api/CLAUDE.md` and `commits.md` already met the step and stay.
  - The recipe avoids `case … in x)` inside `$(…)`, which macOS's bash 3.2 cannot parse.
  - Review: the root keeps `bun add [-d] --catalog=<namespace> <pkg>@<exact>` as a pattern, since
    `tooling.md`'s rule loads only on a manifest and a session runs `bun add` from the shell.
    Kept against the Depth review: the check matches the whole limits line, not only its two
    numbers, as Test first asks it to name the line it expects.
  - Left open: `idioms` is missing from the `Makefile`'s `.PHONY`; the versions in `README.md`,
    `tooling.md` and the PR example are S10's and S11's.

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
- **Status:** done
- **Findings:**
  - Ran in parallel with S11, each in its own worktree; the two touch no file in common.
  - `architecture.md` 415 → 373 lines. The dependency matrix states what each ring may import and
    which guard refuses the rest; `README.md`, `application/CLAUDE.md` and the glossary link it.
  - The R4 version grep needs `git grep -P`: with `-E`, macOS's `git grep` matches no `\b`, so
    the check passed on nothing. `feature.md`'s R4 row and S12's Test first now say `-P`.
  - Review: the `packages/*` row had lost the grit refusal of an app or module import; it states
    `biome-imports.grit` and TS2307 again, `noImportCycles` only for a package above it.
  - Left to S12: `decisions.md › Guards are configuration` and the records' *Guarded by* fields
    still restate the matrix, and `decisions.md` restates the test layout `tooling.md › Tests`
    owns.
  - Left open (judgement calls of the Standards review): the guard table's *Refused by* column
    and *Boundary guards* overlap; `README.md` keeps three invariants a newcomer needs before the
    map.

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
- **Status:** done
- **Findings:**
  - Ledger: stack commands and credentials to `aws.md`; ports to `tooling.md › Worktrees`; the
    migrate command to `database.md › Migrations`; Tests on Docker to `tooling.md › Tests`; the
    database's guards to `database.md › Guards`; versions, the Postgres image and model names to
    `package.json`, the code and `.env.example`. No heading changed, so no anchor moved.
  - `deployment/local/README.md` is deleted (R6); nothing linked to it.
  - Review: `tooling.md` names `packageManager` as the home of Bun's version, which no catalog
    holds; `database.md` keeps that `uuidv7()` needs Postgres 18 or later, the one constraint the
    dropped version carried.
  - Deviation: `.claude/rules/effect-tests.md` said "vitest 5", a live version outside its owner
    that no step lists; fixed here.
  - Left open (judgement calls of the Standards review): `tooling.md` and `aws.md` point to each
    other around Tests on Docker; `aws.md` keeps a few instances (a 24-hour expiry, a 5-minute
    timeout, queue names) a reader needs while debugging.

#### S12 — Decisions, the SDD guide and the move probe

- **Delivers:** `decisions.md` keeps the why, the cost and the guard of each record, pointing to
  the owners for live names; the SDD guide keeps what the skills do not say. The roadmap marks
  `docs-diet` done. A probe that moves a module's folder and renames a file in it needs no edit to
  any instruction file. `decisions.md › Guards are configuration`, the records' *Guarded by*
  fields and the test layout point to `architecture.md`'s dependency matrix and `tooling.md ›
  Tests` instead of restating them (found by S10).
- **Goal:** the last human docs, and proof that a refactor needs no doc edit (R1, R2, R4, R6).
- **Blocked by:** S10, S11.
- **Files:** `docs/knowledge/{decisions,sdd,roadmap}.md`.
- **Test first:** the move-probe seam — `application/chat` moved to a scratch name and one of its
  files renamed: `git grep` of the old names over the instruction files finds none and `make
  doc-names` fails only on the worked example `architecture.md › Where things live` owns;
  reverted.
- **Verify:** `make check`; the probe; the R4 greps (`git grep -P`) over `docs/knowledge/` and
  every `README.md`; `/doctor prompt-audit` run by hand, its findings in the step's report.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - The probe (`application/chat` moved, `chat.id.ts` renamed) left every instruction file clean,
    before the edits and after; a planted rule naming `application/chat` was found. `make
    doc-names` went red only on `architecture.md › Where things live`, whose chat paths are the
    page's worked example: the check catches a stale example there, as it should. Deviation,
    the user's call: R1's acceptance and this Test first now expect that red instead of a green
    `doc-names`; rewriting the example with placeholders was rejected, it loses the concrete
    path a reader copies.
  - `decisions.md`: the *Guarded by* fields name the dependency matrix rows, Boundary guards and
    Known gaps, keeping only what review or a bundle check holds; *Guards are configuration*
    and *Tests in their folders* keep the decision and point to `architecture.md` and
    `tooling.md › Tests`. Live lists went: kernel parts, identity's contract names, a
    repository's methods, constant names, "seven manifests", "five adapters".
  - `sdd.md` keeps why the commit gate is cut as it is and drops what `/ticket-implement` and
    `/ticket-verify` already say.
  - The R4 version grep hits only the roadmap's dated history, out of scope.
  - `docs-diet` is marked done now, as the plan asks, though S13 still runs.
  - Not run: `/doctor prompt-audit`; no agent can run a slash command.

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
- **Status:** done
- **Findings:**
  - Ledger: a step's `Files` names where it starts and what it pins (a decided contract, a trap,
    a probe's target); `Goal` adds the constraints it keeps; `Verify` names the state each check
    fails on, with one probe per replaced guard run red first (L8); a design entry states its
    decision and invariant and links the config that holds a rule; an acceptance row, like its
    requirement, names no path or code name; `Conforms` reads "every literal a step pins".
  - The skill holds each rule; the templates keep short placeholders, so the two no longer say
    it twice.
  - Deviation: `.claude/agents/implementer.md › Leftovers` now also greps the constructor of
    every type whose shape changed and names the files beyond the step's `Files` in the report.
    The removed "every suite … grep its constructor" had no other home (Spec review), and the
    skill's promise that the report names those files had no owner (Standards review).
  - Dropped from the draft: "a kind of step that went wrong for want of a listed file lists it
    again", which no `research.md` finding backs.
  - `docs/knowledge/sdd.md` needed no edit: after S12 it no longer retells a step's file list.
  - Verify: `git grep 'every suite'` over `.claude/skills/` hits on `HEAD` and not on the tree; a
    planted file under `.claude/skills/` was refused by permissions, so the pre-step tree served
    as the red case.

#### S14 — Fixes from verification run 1 and the prompt audit

- **Delivers:** the move probe turns `doc-names` red only on `architecture.md › Where things
  live`; the requirements record the two exceptions the tree already holds (the root
  `CLAUDE.md` keeps the dependency command, `doc-names` skips the roadmap); the limits line has
  its `decisions.md` record; the Effect rules no longer contradict each other on comparing
  errors, nor name a client the repo lacks; the planning skills state rules, not incidents, and
  point to where the worktree's symlink shows; `/ticket-implement` presents each finding the user
  must decide on as one block, ending in its question; the `Makefile` spells the limits line once;
  `worktree.sh` leaves no `.env.new` behind; `effect-style.md` sits under its cap.
- **Goal:** run 2 of `/ticket-verify` passes R1, R2 and R7; the instruction files hold no
  contradiction and no dead example; constraints unchanged (R1, R2, R7, R10, R21).
- **Blocked by:** S13.
- **Files:** `verification.md` run 1 and the prompt audit's proposed diff
  (`/doctor prompt-audit`, 2026-11-03) are the start; they pin `architecture.md › Imports`'s
  chat path, the R2 and R7 rows of `feature.md`, `effect-style.md` and `effect-tests.md` on
  `Equal.equals`, `effect-services.md`'s `SqliteClient` example, `ticket-plan/SKILL.md › Size`,
  `parallel-steps.md`'s `git worktree list` line, `ticket-implement/SKILL.md` step 4, the
  `Makefile`'s `DOC_LIMITS_*`, `worktree.sh`, and S8's finding on the replay's Bash calls.
- **Size:** ~120 lines.
- **Test first:** the move-probe seam — the probe of S12 again, red on `doc-names` only at
  `architecture.md › Where things live`; the checks seam — `doc-limits` still red on a rule at 81
  lines and a reworded limits line after the `Makefile` change, and `worktree.sh` refusing with
  no `.env.new` left when `bun install` fails.
- **Verify:** `make check`; the probes above, each seen red; `git grep -n 'SqliteClient'` over
  `.claude/` finds nothing; `git grep -n 'Equal.equals'` over `.claude/rules/` finds no line that
  lets errors through it.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Move probe: before the fix `make doc-names` failed on `architecture.md:126:
    application/chat/index.ts` and on `:143`–`:150`; after it, only on `:143`–`:150` (› Where
    things live).
  - `doc-limits`, red before and after the `Makefile` change: an 81-line rule gives
    `.claude/rules/zz-probe.md: 81 lines, over 80` (exit 1); a reworded limits line gives
    `.claude/rules/claude-md.md needs one line: …` naming the line with `<n>` for each number
    (exit 2); limits set to 20 and 78 fail `effect-style.md: 79 lines, over 78`.
  - `worktree.sh` with a failing `bun install`, run by the main session (the implementer's
    scratch-repo setup was denied) in a scratch worktree with a `bun` that exits 1 first on
    `PATH`: the script on `HEAD` exits 1 and leaves `.env.new`; the new one exits 1 and leaves
    none.
  - `git grep -n 'SqliteClient' -- .claude/` finds nothing (before: `effect-services.md:50`);
    `Equal.equals` hits only `effect-style.md:78` (models) and `effect-tests.md:68` (never on
    errors).
  - Depth review: the header of `worktree.sh` now states the contract as it is (the draft
    `.env.new` is the only change before the checks; a failed `ln`, rename or install after them
    leaves what it made), and the `doc-limits` comment says `DOC_LIMITS_LINE` holds no digit.
  - Deviation: `tooling.md`'s `doc-limits` row, beyond the step's *Files*, points to the new
    record and says `awk`; D5 records the match and the rejected `DOC_LIMITS_READ`; the owners
    table marks the root `CLAUDE.md`'s dependency command as R2's exception; S8's finding on the
    replay's Bash calls is corrected.
  - Simplify not run: the code is about 12 lines, reviewed by hand; Size 82 lines against ~120.

#### S15 — Lessons L2–L5 of verification run 1

- **Delivers:** a brief of `/ticket-implement` or `/ticket-verify` names its sources and nothing
  else, and no verifier's brief names `plan.md` (L2); a finding that states a check's result
  quotes the output it rests on (L4); a behaviour step is one that changes code (`.ts`, a
  `Makefile` recipe, a script), and only it gets `simplify` and Depth (L5); the plugins whose skills and agents overlap the `/ticket-*`
  skills (`pr-review-toolkit`, `code-simplifier`, `commit-commands`, the plugin `code-review`,
  `superpowers`) are off for this project, and `mattpocock-skills` stays on.
- **Goal:** R13, R18, R19, R20 and R21 hold on the next steps by mechanism or by one line each,
  not by the main session remembering them; no plugin agent runs unasked, edits code or writes
  outside `docs/tickets/` (R13, R18–R21).
- **Blocked by:** S14 (both edit `ticket-implement/SKILL.md`).
- **Files:** `verification.md` run 1 › Lessons; `ticket-implement/SKILL.md` steps 2, 3 and 5,
  `ticket-verify/SKILL.md` step 1; the implementer's frontmatter hooks beside its `Stop` hook,
  and a script in `.claude/hooks/`; `docs/knowledge/sdd.md`'s dependency map if a skill's use
  changes. `enabledPlugins` in `.claude/settings.json`, each key `<plugin>@<marketplace>` as the
  installed plugin names it (`superpowers` is already off); a plugin skill is never edited.
  Trap: `skillOverrides` does not reach plugin skills, and `settings.local.json` overrides the
  project file.
- **Size:** ~90 lines.
- **Test first:** the hook seam — the guard refuses `cat <tracked file>`, `sed -n 1,5p <tracked
  file>` and `git checkout -- <file>` through the implementer's Bash, each seen red, and lets
  `git status`, `make check` and `cat` of an untracked log through.
- **Verify:** `make check`; the hook probes; each lesson's line found by `git grep` in its skill;
  a new session lists none of the disabled plugins' skills or agents, which the session before
  the change still lists.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Hook seam, red first: before `.claude/hooks/bash-guard.sh` existed every refuse case came
    back allowed; round 3's new cases were red on round 2's guard (`FAIL allow (exit 0) cat
    …/repo-link/CLAUDE.md`, `FAIL allow (exit 0) git switch -f main`, `FAIL allow (exit 127) no
    bun on PATH, cat README.md`). After: `probe.sh exit 0`, `extra.sh exit 0`, e.g. `ok refuse
    (exit 2) cd docs && cat ../README.md`, `ok allow (exit 0) git grep -n "git checkout" --
    .claude`, `ok allow (exit 0) cat probe-untracked.log`.
  - Deviation: the guard refuses every git command that drops uncommitted work, not only the
    three L3 names: also `clean`, `reset --hard` and `switch` with `--discard-changes`, `-f` or
    `--force` (simplify's altitude pass and the hunt). Writes through Bash pass, as the header
    and `sdd.md` say.
  - Deviation: only words naming an existing file inside the repo, symlinks resolved, reach one
    `git ls-files` per command, so a shell glob over tracked files (`cat src/*.ts`) passes.
  - The guard refuses when it fails (bad JSON, no bun: `bash-guard.sh failed (exit 127), so the
    command is refused`); a Bash call naming no guarded word never starts bun (`git status`
    0.007 s against 0.046 s).
  - The guard is `sh` with an inline `bun` script, like `make-check.sh`, not a `.ts` file, which
    the Effect rules bind; the two command lists live once, in the `sh` part.
  - Plugins: `claude plugin list --json` in the repo shows `pr-review-toolkit`,
    `code-simplifier`, `commit-commands`, `code-review-anthropics` and `superpowers`
    `enabled=false`, `mattpocock-skills` `enabled=true`; outside the repo all five are
    `enabled=true`.
  - Not run: a live probe through a fresh implementer's Bash and a new session's skill and
    agent lists; both need a session started after the change.
  - Rounds: S15.1 the lessons and the guard; S15.2 simplify (prefilter, one `git` call per
    command, `reset --hard` and `clean`); S15.3 the reviews (symlinks, `switch`, a failing guard
    refuses, one owner for the lists, the header narrowed to reads). Size about 215 lines against
    ~90: the guard parses shell words so a quoted mention or a here-document body passes.
  - Round 4: the guard removed on the user's word; L3 rests on the line in `implementer.md`.

#### S16 — Named functions as declarations

- **Delivers:** `effect-style.md` says a named function is a `function` declaration and an arrow
  is a callback or an expression body, with one example of each; every named block-bodied arrow
  in the code (about 18, such as `apps/web/main.ts`'s `proxyToApi`) is a declaration.
- **Goal:** one way to write a named function, so a reader and an agent meet one shape; no
  behaviour changes. Asked by the user on 2026-11-03, outside the requirements; `feature.md ›
  Scope` records it in the same commit.
- **Blocked by:** S15 (run in order; a plugin agent that rewrites declarations into arrows goes
  off in S15).
- **Files:** `.claude/rules/effect-style.md`, at 79 of 80 lines, so the rule replaces a line
  rather than adding one; the code the implementer finds by grep for a named block-bodied arrow
  (`const <name> = (…) => {`), outside `repos/`. Traps: an arrow typed by its `const`'s
  annotation (`const f: Handler = …`) keeps its type only as an arrow, so it stays; a value built
  by a call (`Effect.fn(…)`, `Layer.effect(…)`) is not an arrow and stays.
- **Size:** ~120 lines.
- **Test first:** `config only` — a refactor: `make check` green before and after, no test
  changed.
- **Verify:** `make check`; the grep for a named block-bodied arrow finds only the kept cases,
  each named in the report; `make doc-limits` passes on `effect-style.md`.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - 22 named block-bodied arrows became declarations, four of them with multi-line signatures
    that a one-line grep misses; the multi-line grep found a planted probe
    (`packages/testing/zz-probe.ts:1:plantedProbe`) and on the tree only `keepEarlyFinish`,
    kept as typed by its `const`. Kept too, as values built by a call: `HttpClient.make`,
    `Effect.sync`, `Effect.suspend`, `Logger.make`.
  - `make check` before and after: exit 0, `221 passed (221)` and `104 passed (104)`; no test
    changed. `make test-e2e` not run; the four e2e files change only declaration lines, which
    the typecheck covers.
  - Ledger: `effect-style.md` gains the rule in › Signatures and drops the Composition bullet's
    pointer to the lookup-table rule, which › Branching states in full; 80 of 80 lines.
  - Deviation: `feature.md › Out of scope` now excludes code changes other than the shape of a
    named function, or it would contradict this step.
  - Reviewed as a mechanical step (Standards and Spec): only declaration lines change, no body,
    so `simplify` and Depth had nothing to judge.

#### S17 — Fixes from verification run 2

- **Delivers:**
  - `/ticket-implement`'s Depth paragraph becomes a pointer to `docs/knowledge/sdd.md › What the
    wrappers override`, where the same text lives; step 1 reads only the plan's **Status** table
    and the step's own section (L9); a step is ready only once the passes steps 2 and 3 name for
    it have run, and the commit body names them (L7).
  - The round commit is stated once, in `sdd.md › Gates`: before the user's recommendation or the
    main session's fixes land, what stands commits as its round; the skill's step 5 points to it
    (the user's choice, 2026-11-03).
  - `/ticket-plan`: a step that edits a file a requirement measures re-measures it in its
    **Verify** (L6).
  - `reviewer.md`: Depth leaves a correctness bug to the hunt; Standards reports only a binding
    rule it can cite (L8).
  - `.claude/rules/tooling.md` keeps one or two lines of its constraints and points to
    `docs/knowledge/tooling.md` for the rest (R6, the user's choice A).
  - `make doc-names` writes per-run temporary files instead of `node_modules/.cache/doc-names/`,
    and stops with exit 2 when a `grep` inside it fails with 2.
  - `effect-style.md` drops "`.value` only under a narrowing guard", which the compiler enforces;
    `deployment/CLAUDE.md:3-4` loses "until the deploy ticket lands"; the Leftovers grep in
    `implementer.md` also covers `.claude/` and the `CLAUDE.md` files.
- **Goal:** R15 and R16 hold again with every line this step adds counted (body ≤ 1 761 tok,
  characters ÷ 4); R13 gains margin; R6, R19, R20 and R21 hold by one line each; two parallel
  checks in one tree cannot corrupt each other.
- **Blocked by:** S16.
- **Files:** `verification.md` run 2 › Simplifications and Lessons;
  `.claude/skills/ticket-implement/SKILL.md`, `.claude/skills/ticket-plan/SKILL.md`, `.claude/rules/sdd.md`,
  `.claude/agents/reviewer.md`, `.claude/agents/implementer.md`, `.claude/rules/tooling.md`,
  `.claude/rules/effect-style.md`, `deployment/CLAUDE.md`, the `doc-names` recipe in `Makefile`;
  the record in `docs/knowledge/decisions.md` if the round rule has one. Trap: the lesson lines
  add to the skill the cut must shrink, so measure after all of them.
- **Size:** ~100 lines.
- **Test first:** the `doc-names` seam — two runs started together on the clean tree both exit 0,
  seen red first against the shared cache; a pattern `grep` rejects makes the recipe exit 2.
- **Verify:** `make check`; R16's and R13's measurements repeated, each quoted; `git grep` finds
  each lesson's line in its file; in a new session, the first step asks the commit question once
  (R17) and no disabled plugin's skill or agent is listed.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - **`doc-names` seam, red first.** Two runs started 0.8 to 2.0 s apart against the shared cache:
    the first exited 2 every time, with 252 down to 4 false hits (`docs/knowledge/ai.md:67:
    InvalidOutputError`, `http-api/CLAUDE.md:3: HttpApi`); `make doc-names SOURCE_PATH='('`
    printed `grep: parentheses not balanced` and exited 0, and `PASCAL='[A-Z'` exited 0 too. A
    failing `paste` on `PATH` emptied the top-folder list and gave about 60 false hits
    (`README.md:56: /health`), exit 1.
  - **Green, at the last round.** The same staggered pairs (0 to 2.0 s): `0 0` each time. A
    rejected pattern: `doc-names: a grep failed`, `make: *** [doc-names] Error 2`. The failing
    `paste`: `doc-names: git ls-files listed nothing`, Error 2. Planted hits still exit 1:
    `.claude/agents/verifier.md:39: apps/nope/missing.md`, `…: ProbeMissingName`, `…:
    apps/api/src/x.ts, write the pattern`. A clean run exits 0. The read loop's `|| exit 2`
    fires on a missing names file (the hunt's probe in S17.2's review).
  - **R16** (the skill body without front matter, characters ÷ 4): run 2 7 272 chars / 1 818 tok;
    now **6 721 chars / 1 680 tok, −23.7%** against 2 202, under 1 761, with the L7 and L9 lines
    counted.
  - **R13** (the 13 rules the implementer loads, characters ÷ 4): run 2 39 842 chars / 9 961 tok;
    now **39 688 chars / 9 922 tok, −20.3%** against 12 452.
  - **Lessons, each `git grep` hit in the tree and absent at `HEAD` before the step:** L9
    `ticket-implement/SKILL.md:15`; L6 `ticket-plan/SKILL.md:33`; L8 `reviewer.md:26` (Standards
    needs a rule to cite) and `reviewer.md:34` (a correctness bug is the hunt's); L7 and the
    round rule in `sdd.md › Gates`, which the skill's step 5 points to.
  - `make check`: exit 0 at each round. Not run: the new-session check of R17's question and of
    the disabled plugins' listing; it needs a new session.
  - **Deviation, Depth (S17.1, S17.2).** The plan's "pointer to `docs/knowledge/sdd.md`" held
    only part of the paragraph. The skill names the Depth brief's sources inline, as the hunt's;
    `reviewer.md › Depth` owns what the pass reads, judges and labels, and which decisions it
    re-opens only on real friction; the `sdd.md` override row keeps the override and the why.
  - **Deviation, readiness (S17.2, S17.3).** L7's "ready once the passes steps 2 and 3 name have
    run" lives in `sdd.md › Gates` as "the passes `/ticket-implement` names for it ran"; the
    skill points to it and asks the commit body to name the passes that ran. R17 in `feature.md`
    now says the same.
  - **Deviation, L6's home.** In `/ticket-plan`, as this step says; run 2's L6 proposed
    `/ticket-implement`.
  - **Deviation, Leftovers.** `deep-modules.md › After a removal` restated the implementer's
    Leftovers scope with a different list; it is gone, since only the implementer acts on it.
  - **Ledger.** `tooling.md` (rule) keeps the catalog pin and the config layers with
    `.env.pulumi`; dropped, each owned by `docs/knowledge/tooling.md`: the namespace choice
    (› Catalogs), declaring in other workspaces (› Add a dependency), `.env.example`, the
    `--env-file` pair, quoting and tests without `.env` (› Environment), `--hot` / `--watch`
    (› `--hot` vs `--watch`), "never commit `.env.pulumi`" (`.gitignore`). `effect-style.md`
    drops "`.value` only under a narrowing guard", which `tsc` enforces. `deployment/CLAUDE.md`
    loses the future event. The skill's feedback bullet points to `sdd.md › Gates` for the round
    id and the `plan.md` rule.
  - Passes: `simplify` after S17.1; Standards, Spec, Depth and the hunt on S17.1 and S17.2;
    S17.3 applies their last findings and is not reviewed again.

#### S18 — The Effect-style checks as Biome rules

- **Delivers:**
  - A second GritQL plugin beside the import one refuses what `make service-use`, `make idioms`
    and `make nested-calls` refused: a service reached by `Effect.flatMap` or `Effect.map`, a
    check against `undefined`, a sort by a comparator lambda, a data-first combinator whose subject
    is another call. `make lint` and CI's `biome ci` report them with file and line.
  - The three targets, their variables, their `check:` entries and their CI steps are gone; the
    tooling page's rows for them become one line on the plugin, and the rules that name the gates
    point to it.
  - `make bundle-check` exits 2 when its `grep` fails, instead of reading the failure as a clean
    bundle.
- **Goal:** R24 for the TypeScript checks, with every case each shell check refused still refused
  (D16); the exemptions the shell checks recorded (`Effect.gen` as a subject, data-last calls,
  `Effect.forEach` with options, the migrations) still pass.
- **Blocked by:** S17.
- **Files:** `biome-imports.grit` and `biome.json` › `plugins` (the precedent: a plugin is a path
  in that list); the new plugin is `biome-effect.grit` beside it. The shell recipes at `HEAD`
  hold the exact lists and exemptions to port: read them from `git show HEAD:Makefile`, and the
  comments above each target. Trap: Grit has no type information, so a service is a capitalised
  identifier, as in the perl; a call pattern with a trailing `$...` misses calls only as a later
  branch of an `or` sharing one `where`; standing alone it matches any arity. The rules that name the gates: `.claude/rules/effect.md` and
  `.claude/rules/effect-style.md` (R13 counts both: re-measure). `docs/knowledge/tooling.md` (the
  rows), `.github/workflows/ci.yml` (the steps), `docs/knowledge/decisions.md › Guards are
  configuration` (Guarded by).
- **Size:** ~200 lines (plugin ~60, Makefile −70, CI −8, docs ~20).
- **Test first:** the probe Seam of R24: one probe `.ts` file per shell check, holding each case
  the recipe's comments name as refused and as exempt, run red against the shell target at `HEAD`
  before the target goes, then red against `biome lint` on the same file with the same lines.
- **Verify:** each probe fails `biome lint` with the lines the shell target named, and each exempt
  case passes; `make check` and `bunx biome ci` green on the tree; a probe `grep` pattern the
  bundle check's `grep` rejects makes `make bundle-check` exit 2 (red before the fix: exit 0);
  `make help` lists no `service-use`, `idioms` or `nested-calls`; `git grep` finds no reference
  to them outside `docs/tickets/`; R13 re-measured. Probes are deleted before the commit.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - **Red at `HEAD`.** Probes `service-use.ts`, `idioms.ts` and `nested-calls.ts`, each case the
    recipes' comments name. `make service-use`: `service-use.ts:2,3,4,5,6`, `Error 1`; `make
    idioms`: `idioms.ts:2,3,4,5` and `:10`, `const text = 'value === undefined, xs.sort(('`, a
    hit inside a string; `make nested-calls`: `nested-calls.ts:2–6` (unary), `8–13` (one),
    `15–17` (two), `Error 1`. `bunx biome lint` before the plugin: no plugin diagnostic.
  - **Green.** `bunx biome lint --reporter=github` with `biome-effect.grit`: the same lines, one
    diagnostic each, minus `idioms.ts:10`; every exempt case passes
    (`Effect.scoped(Effect.gen(…))`, a lone data-last call with or without a trailing comma,
    `Effect.forEach(f, { discard })` and `(makeHandler(x), { concurrency })`, a constructor,
    schema or predicate over a call, `.use`, `.useSync`); `bunx biome ci`: 23 plugin errors on
    the probes, exit 0 on the tree. Rerun at S18.2 on the main session's `$...` rewrite: the same
    lines, and `Effect.zipWith(Effect.succeed(1), (a, b) => a + b)` passes.
  - **`make bundle-check`.** A pattern with an unbalanced `(`: `grep: parentheses not balanced`,
    exit 0 before the fix; after it `bundle-check: grep failed`, `Error 2`. A key planted in
    `node_modules/.cache/web-bundle/`: printed, `Error 1`; the clean tree: exit 0.
  - **A plugin that errors (S18.2).** A scratch plugin with a capturing group, listed in
    `biome.json`: `i broken errored: regex pattern matched 1 variables, but expected 0`, and
    `make lint` and `bunx biome ci` both exit 0 before the fix; after it `make lint` and
    `make lint BIOME=ci` print `lint: a Biome plugin errored and checked nothing in that file:
    fix the plugin.`, `Error 2`. A plain lint error still fails with `Error 1`.
  - `make help | grep -E "service-use|idioms|nested-calls"`: exit 1 (the Makefile before S18
    lists all three); `git grep` of the targets, `NESTED_`, `IDIOMS` and the negated `grep` outside
    `docs/tickets/` and `repos/`: exit 1 (before S18: 27 hits in five files); `git grep` of
    `bun run lint` and the `lint` script: exit 1. `make check`: exit 0 at each round.
  - **R13** (the 13 rules, characters ÷ 4): 39 688 → **39 672 chars / 9 918 tok, −20.35%**
    against 12 452; S18.2 changes no rule.
  - **Deviation, the string hit.** The plugin reads syntax, so an `=== undefined` inside a string
    no longer fails (D16's reason for the move).
  - **Deviation, the migrations.** Their exemption is `biome.json › files.includes`
    (`!kernel/data/migrations`), not a path test in the plugin; the repo's one migrations folder
    holds SQL only. A probe there: no hit.
  - **Deviation, narrower than the perl.** A unary combinator's subject must be a call or a chain
    of calls, so `Effect.orDie(load(id).value)` passes where the perl's prefix match refused it.
    `zipWith` left the `two` list (S18.2): its data-last form takes an effect first, so the list
    refused valid code; `Effect.zipWith(call, call, f)` now passes too.
  - **Deviation, one way to run Biome (S18.2).** Biome reports a plugin that errors on a file as an
    info notice, skips the plugin there and exits 0, in 2.5.15 with no option to fail on it. `make
    lint` runs `bunx biome $(BIOME) --diagnostic-level=info --colors=off` and fails with exit 2 on
    ` errored: `; CI's `static` job runs `make lint BIOME=ci`, and the `lint` script of
    `package.json` is gone, so no path runs Biome without the check but the `pre-commit` hook's
    `--staged` run, which CI backs.
  - Passes: `simplify` after S18.1 (the `$...` patterns, a `nested` predicate, the header);
    Standards, Spec, Depth and the hunt on S18.1; S18.2 applies their findings (the plugin
    error, `zipWith`, the `make lint` row cut to what it runs and where its cases are read).

#### S19 — The doc checks as `markdownlint-cli2` rules

- **Delivers:**
  - `markdownlint-cli2` lints the Markdown outside `docs/tickets/` and `repos/` with one config at
    the root: the 100-character width (MD013, tables, code and a lone link exempt as `doc-width`
    exempted them), a backticked repo path that does not exist (the roadmap skipped), a source
    path in an instruction file, a rule whose `paths:` filter matches no file, and a `CLAUDE.md`
    or rule over its limit, the numbers read from `claude-md.md`'s limits line. Every other
    markdownlint rule is off.
  - `make doc-names`, `make doc-width`, `make doc-limits` and `make rule-paths` are gone, with
    their CI steps; one target runs the doc lint in `make check` and CI. The check of backticked
    PascalCase names is dropped, and `feature.md › R7` already asks for paths only.
  - `make ids` is gone with its CI step, on the user's word; review against `comments.md` and
    `claude-md.md` refuses a ticket id outside `docs/tickets/`.
  - `claude-md.md › The limits and the checks`, the tooling page and the records
    `Instructions name patterns`, `Instructions within size limits` and `Decisions recorded in one
    page` name the doc lint in place of the old targets.
- **Goal:** R24 for the Markdown checks, R7–R11 kept (R7 for paths), D5's limits still read from
  one line (D16).
- **Blocked by:** S18.
- **Files:** the config is `.markdownlint-cli2.mjs` at the root, its custom rules inline; the
  dependency is `bun add -d --catalog=tools markdownlint-cli2@0.24.0`. The shell recipes at `HEAD`
  hold the scopes, the allowlist (`DOC_NAMES_ABSENT`, its paths only) and the source-path pattern
  to port. Traps: markdownlint's `frontMatterLines` include the `---` delimiters; MD013 `stern`
  flags a lone long link that `doc-width` exempted (`docs/knowledge/architecture.md` holds one),
  so it stays off; `repos/drizzle/.markdownlint.yaml` is a nested config the globs must exclude;
  `rule-paths` matched with git's glob over tracked and untracked files, and a brace failed. The
  target's name is `doc-lint`.
- **Size:** ~300 lines (config ~70, Makefile −110, CI −10, docs and records ~40, lockfile
  excluded).
- **Test first:** the probe Seam of R24: one probe per shell check (a long prose line, a missing
  backticked path in a skill and a `README.md`, a source path in a rule, a rule filter to a folder
  that does not exist, a rule over 80 lines), run red against its shell target at `HEAD`, then red
  against the doc lint with the same file and line.
- **Verify:** each probe fails the doc lint as it failed the shell target; the exemptions pass (a
  table, a fence, a lone link, a placeholder pattern, a package specifier, a doc pointer, a
  `DOC_NAMES_ABSENT` path); a reworded limits line makes the doc lint fail naming it;
  `make check` green; `git grep` finds no reference to the five gone targets outside
  `docs/tickets/`; R13 re-measured,
  since `claude-md.md` is one of the rules it counts. Probes are deleted before the commit.
- **Model:** `opus high`
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S5, S9, S12, S14 |
| R2 | S5, S7, S8, S9, S10, S11, S12, S14 |
| R3 | S5, S7, S8, S9 |
| R4 | S10, S11, S12 |
| R5 | S5, S7, S8, S9 |
| R6 | S10, S11, S12, S17 |
| R7 | S2, S14, S17, S19 |
| R8 | S2, S19 |
| R9 | S2, S19 |
| R10 | S9, S19 |
| R11 | S2, S9, S19 |
| R12 | S1, S3 |
| R13 | S1, S3, S8, S15, S17, S19 |
| R14 | S1, S7, S8 |
| R15 | S1, S3, S4, S8, S17 |
| R16 | S1, S4, S17 |
| R17 | S5, S17 |
| R18 | S6, S15 |
| R19 | S6, S15, S17 |
| R20 | S6, S15, S17 |
| R21 | S6, S14, S15, S17 |
| R22 | S6 |
| R23 | S13 |
| R24 | S18, S19 |

S16 serves the user's request of 2026-11-03, outside the requirements; `feature.md › Scope`
records it.
