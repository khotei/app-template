# Lean instructions — architecture

> Ticket: `2026-11-02-1820_lean-instructions` · Requirements: [feature.md](./feature.md)

## Overview

The ticket changes no code. It changes three things around it: the **text** of every Markdown
file outside `docs/tickets/` (patterns and pointers instead of instances, shorter rules, one owner
per fact), the **checks** in `make check` that keep the text that way, and the **reading** the
toolkit does per session (what the implementer, the reviewers and `/ticket-implement` load).

```mermaid
graph LR
  subgraph text [the text]
    owner[one owner per fact] --> pointer[pointers elsewhere]
    trim[rules trimmed, filters kept]
    gate[the commit gate, once]
  end
  subgraph checks [make check]
    names[doc-names: every doc, no source path in an instruction file]
    filters[rule-paths: every filter matches]
    limits[doc-limits: 40 and 80 lines]
  end
  subgraph reading [the toolkit]
    impl[implementer: rules arrive by filter]
    rev[reviewers: the cited design, the matching rules]
    skill[ticket-implement: parallel steps on demand]
  end
  checks -->|refuse drift in| text
  claude[claude-md.md] -->|names the test, the owners, the limits, the checks| checks
```

The facts that shape the design, from two experiments, a fresh audit and the official docs
(Claude Code 2.1.309):

- **A subagent loads instructions on its own.** It gets the root `CLAUDE.md` and the rules
  without `paths:` at its start, and loads a path-scoped rule or a nested `CLAUDE.md` when it reads
  or writes a matching file; it inherits nothing the main session loaded.
- **A rule arrives after the write that matched it**, and so does any hook's
  `additionalContext`: nothing reaches Claude before a `Write` of a new file.
- **Every `.ts` file of a module loads the same rule set**, about 9.6k tokens; a services file
  read after a domain file loads nothing more. A step pays for the union of its layers.
- **About 22% of the instruction tokens are retold facts or lines Claude gets right anyway**, by
  the fresh audit; the largest items are default Effect style in `effect-style.md`, the "where"
  column of `naming.md`'s file table, and `layering.md` and `modules.md` covering one subject.
- **The docs advise against emphasis markers**: current models over-apply an emphasised rule, and
  a rule that cannot bend belongs in a check or a hook.
- **`git ls-files ':(glob)…'` matches what `paths:` matches for `*` and `**`, and nothing for
  braces**, which Claude Code expands and git does not.

Order of the work, for the plan: the baseline measurement first, on the tree as it stands; each
check lands in the step that makes the tree pass it; each lever is measured against the baseline
in the step that lands it. The ticket starts only after the `modular-monolith` ticket passes its
verification.

## Structure

| Area | Change |
|---|---|
| `Makefile` | `doc-names` reads every `*.md` outside `docs/tickets/`, `repos/` and the roadmap, and refuses a source path in an instruction file; new `rule-paths` and `doc-limits`; a target that sets up a parallel step's worktree; `check` runs the new checks |
| `.claude/rules/claude-md.md` | the test, the owner of each fact, the pattern, the limits line, each check by its `make` target; its toolkit section cut to what `docs/knowledge/sdd.md` does not hold |
| `.claude/rules/*.md` | rewritten to patterns and trimmed; filters kept; `layering.md` and `modules.md` merged or split so each subject has one file; the Effect-4 trap first in `effect.md` |
| every `CLAUDE.md` | rewritten to patterns and pointers; the traps the branch found added where they bite |
| `.claude/rules/sdd.md` | owns the commit gate |
| `.claude/agents/implementer.md` | rules arrive by filter; read a file of a folder before writing a new file in it |
| `.claude/agents/reviewer.md` | reads only the design parts and the rules the brief names |
| `.claude/skills/ticket-implement/` | `SKILL.md` names the step's design parts and matching rules in the review brief, asks the commit question once per session, and points to **new** `parallel-steps.md`; the worktree setup becomes a **new** script beside it |
| the other skills, the agents | the commit gate as a pointer; patterns |
| `docs/knowledge/*.md`, `README.md`, `.github/*.md` | each fact kept only in its owner; live names, counts and versions only in the doc that owns them |
| `docs/knowledge/tooling.md` | the table of `make` targets and the CI `links` job name the new checks and the worktree target |
| `docs/knowledge/decisions.md` | new record **Instructions name patterns** (D3) |
| `docs/knowledge/sdd.md` | the dependency map and the approval gate, where reading or gating changes |
| `docs/knowledge/roadmap.md` | entry `docs-diet` marked done |
| `deployment/local/README.md` | **deleted**: it retells `aws.md` (R6) |

### Owners of the facts told in several places

Each fact is stated once, in its owner; every other file points to it by name (R2).

| Fact | Owner | Today also stated in |
|---|---|---|
| The rings, which folder holds what | `architecture.md › The three rings` | root `CLAUDE.md` map, `README.md`, the glossary, `application/CLAUDE.md` |
| Versions | the manifests (root `package.json`: `packageManager`, the catalogs); a doc says "the pinned version" | root `CLAUDE.md`, `README.md`, `effect.md`, `tooling.md`, `aws.md`, the PR example |
| The test layout | `tooling.md › Tests` | `architecture.md`, `README.md`, `naming.md`, `modules.md` |
| The resource naming | `aws.md` | `deployment/CLAUDE.md` |
| The dependency command | `tooling.md › Add a dependency` | root `CLAUDE.md` |
| The worktree ports | `tooling.md › Worktrees`; the setup script computes them | the block of `/ticket-implement`, `aws.md` |
| The database's guards | `database.md › Guards`; the repository's write contract stays in the rule that loads in the data layer; the why in `decisions.md` | `layering.md`, `effect-tests.md`, `architecture.md`, `README.md` |
| The data layer's types rule | `kernel/CLAUDE.md`; the why in `decisions.md` | `modules.md`, `naming.md` |
| The commit gate | `sdd.md › Gates` | `commits.md`, `pull-requests.md`, the five skills, `implementer.md`, `claude-md.md` |

A major version that changes what Claude writes (Effect 4 against the Effect 3 it remembers) is a
trap, not a version: it stays once, first in `effect.md`, in plain words (R5, D4).

## Contracts

The checks are the contracts other sessions rely on. Each prints one line per hit and exits 1;
an internal failure (a pattern that does not compile, a missing limits line) exits 2. None reads
`repos/`, which holds a tracked vendored skill.

```text
$ make doc-names     # R7, R8
<file>:<line>: <path or name>
<file>:<line>: <source path>, write the pattern
$ make rule-paths    # R9
<rule>: <filter>
$ make doc-limits    # R10
<file>: <lines> lines, over <limit>
```

**The source path `doc-names` refuses** (D3): in an instruction file (every `CLAUDE.md`,
`.claude/rules/`, `.claude/skills/`, `.claude/agents/`), a backticked span with a `/`, ending in
`.ts`, `.tsx` or `.json`, with no `<…>` placeholder, no glob and no `@app-template/` prefix.

**The limits line in `claude-md.md`** (D5), which `doc-limits` reads:

```md
- **Limits, checked by `make doc-limits`:** a `CLAUDE.md` 40 lines, a rule 80.
```

**A rule's filter** uses only `*` and `**`; a brace matches nothing in git, so `rule-paths` fails
it.

**The review brief of a step** (D2), from `/ticket-implement` to each `reviewer`: the step id,
its `R…` ids, its `D…` ids, its Seam row and its Contracts entries; to the Standards reviewer also
the rules without `paths:` and those whose filter matches a file of the diff (the skill matches
them with `git ls-files ':(glob)<filter>'` over the diff's files). The reviewer locates each
design part with `grep -n` on the stable anchors (`- **D<n> —`, `## Seams`, `## Contracts`) and
reads it with offset and limit, as the implementer does.

**The commit question** (D8), asked by `/ticket-implement` once, at the first step of a session:
commit each ready step without the user's OK, or wait for it. A step is ready when its reviews
ran, their fixes are in and `make check` is green. Pushing, a PR and a merge always wait.

**The parallel-steps path** (D9): `SKILL.md` keeps one line, "for steps run in parallel, read
`parallel-steps.md` beside this file"; that file holds today's section, and the worktree setup
runs as `make <target> N=<n> NAME=<name>` over a script in the skill's folder, with the same
refusals and the same `.env` it writes today.

## Seams

| Seam | Catches | Misses |
|---|---|---|
| `make doc-names`, `make rule-paths`, `make doc-limits`, run on a planted probe and on the clean tree | each form R7–R10 name, red on the probe with file and line, green on the tree | whether a true, existing name merely retells the code (judged in review, R3, R4) |
| `make check` on the tree | the checks wired into the gate and green together | the same as above |
| A move probe: a module folder moved and a file renamed, then `git grep` of the old names over the instruction files, then reverted | R1: no instruction file names an instance a refactor moves | a constraint that changed without a doc edit |
| The `InstructionsLoaded` log and the agents' transcripts, on the scenarios of D6, before and after | R12–R16: what loads and what is read, per lever, in the same units | whether Claude is guided as well with less (judged in review and the ledger) |
| `/doctor prompt-audit`, run by hand at verification | R2: contradictions and dead references across the instruction files | facts retold in agreement |
| `make <worktree target>` in a scratch worktree, against the old block's output | R16: the same refusals, ports and stage in the written `.env` | a parallel run end to end |
| A new session's first `/ticket-implement` step, then its second | R17: the question asked once, the answer held | the gate's wording in every pointer (judged by `git grep`) |
| The step report's ledger: each removed line with its new home or "dropped:" and why, each trap added and where | R3, R5, R6, R14: nothing lost silently | nothing beyond what the reviewer reads |

## Decisions

- **D1 — R14's cut comes from trimming the rules' text; the path filters stay as they are.**
  (answers Q1)
  - **Why:** every `.ts` file of a module loads the same rule set, and a step edits several
    layers, so it pays for their union: filters by layer would save only what no layer of the
    step needs, about 10–14% for services. Trimming the retold and default-style lines cuts about
    30% of that load on every edit, with no filter that can miss a file.
  - **Cost accepted:** each rule is rewritten line by line, judged by the ledger; a domain-only
    edit loads lines it does not need.
  - **Reversal:** one commit per rewritten rule (restore its text).
  - **Rejected:**
    - filters by layer folder, with sections moved between rules — a small cut per step, a
      regrouping, and a filter that can miss a file it binds;
    - filters by file suffix — misses a file under a new suffix, and no check sees it.

- **D2 — `/ticket-implement` names what a reviewer reads: the design parts the step cites, and on
  Standards the rules that match the diff.** (answers Q2; R12)
  - **Why:** the skill knows the step and the diff; a reviewer left to find them opens the whole
    design and every rule to be sure. A rule whose filter matches no diff file cannot bind it.
  - **Cost accepted:** a step that touches a decision it does not cite is reviewed without it; a
    reviewer still opens more when the diff touches a contract the cited parts do not quote.
  - **Reversal:** one commit.
  - **Rejected:**
    - the reviewer finding the parts on its own — no cut it can be held to.

- **D3 — No concrete source path in an instruction file: one pattern in `doc-names`.** (answers
  Q3; R8)
  - **Why:** the instances that churned are source files (`shared/tags.ts`); one pattern refuses
    them, and `doc-names` already fails any other stale name after a rename. The record
    **Instructions name patterns** in `docs/knowledge/decisions.md` says why, landed with the
    check.
  - **Cost accepted:** a bare file name or a folder instance passes until it goes stale; R1's probe
    finds those at verification.
  - **Reversal:** one commit (drop the pattern).
  - **Rejected:**
    - a separate `doc-paths` with anchors derived from `exports` and depth — four heuristics for
      three hits;
    - an allowlist of names — itself a copy that goes stale.

- **D4 — No emphasis markers; the costliest trap leads its file in plain words.** (answers Q4)
  - **Why:** the docs say emphasis makes current models over-apply a rule and that a rule which
    cannot bend belongs in a check; the branch shows no costly breach a mark would have stopped.
    The costliest trap, checking an Effect API against `repos/effect` rather than memory of
    Effect 3, moves to the first line of `effect.md`, at no cost in tokens.
  - **Cost accepted:** nothing marks a line as heavier than its neighbours; weight comes from
    order and brevity.
  - **Reversal:** one commit.
  - **Rejected:**
    - `**Required:**` marks with a cap, a check and a hard stop on a breach — machinery for an
      unevidenced problem, and the hard stop took the decision from the user.

- **D5 — The limits are numbers in `claude-md.md`, and `doc-limits` reads them from it.**
  - **Why:** R10 names the limits the maintenance rule states; one author per fact is the
    ticket's own rule, and a second copy in the `Makefile` would drift unseen.
  - **Cost accepted:** the check depends on one line's shape; a reworded line makes it exit 2,
    naming the line it expects. The "about" goes: 40 and 80 become hard.
  - **Reversal:** one commit (move the numbers into `Makefile` variables).
  - **Rejected:**
    - the numbers in the `Makefile`, the rule pointing to them — a reader of the rule must open
      the `Makefile` to learn a limit.

- **D6 — The levers are measured on fixed scenarios, before and after, counting only the slice
  each lever targets.**
  - **Why:** an agent's whole context varies from run to run; the slice a lever targets does not.
    The baseline is taken in the first step, before any lever lands, with an `InstructionsLoaded`
    hook kept out of git:
    - R12: the reviewers of one committed behaviour step of `modular-monolith`, replayed
      uncommitted in a scratch worktree; the slices are what they read of the ticket's
      `architecture.md` and, for Standards, of `.claude/rules/`;
    - R13: the implementer on the same replayed step; the slice is the rules it reads or loads;
    - R14: one session that edits a `.ts` file of a module's `domain/`, then one of its
      `services/`; the slice is the rules and `CLAUDE.md` loaded;
    - R16: the text `/ticket-implement` loads on a one-step run.
  - **Cost accepted:** about six agent runs for R12 and R13, the replay of a real step on
    `opus`.
  - **Reversal:** none needed; it changes no file the ticket commits.
  - **Rejected:**
    - computing the cut from file sizes alone — blind to whether the agents read what the brief
      says.

- **D7 — The implementer relies on the filters, and reads a file of a folder before writing a
  new file in it.** (R13)
  - **Why:** a subagent loads path-scoped rules itself, but a rule matched first by a `Write`
    arrives after the file is written; reading a neighbour first loads the folder's rules in
    time.
  - **Cost accepted:** one extra read when a step starts a new folder; a rule lost to the
    implementer's own compaction returns only at its next matching file.
  - **Reversal:** one commit.
  - **Rejected:**
    - keeping the up-front read of every rule — 24% of the implementer's load;
    - a hook that injects the rule before a write — the docs place hook context after the tool
      result, so it cannot.

- **D8 — The commit gate lives in `sdd.md › Gates`, and `/ticket-implement` asks once per session
  whether ready steps commit without the user's OK.** (R17)
  - **Why:** the gate is told in ten files and they say "only on the user's OK", while the user
    commits ready steps without one; contradicting instructions let Claude pick either. Asking
    once keeps the choice the user's in each session, and a team adopting the template keeps the
    strict answer by giving it.
  - **Cost accepted:** a new session asks again; a session that forgets its answer after
    compaction asks again.
  - **Reversal:** one commit.
  - **Rejected:**
    - "only on the user's OK" everywhere — slows every step and no longer matches the practice;
    - commit without asking, always — a team adopting the template loses the gate silently.

- **D9 — `/ticket-implement` keeps its parallel-steps procedure in a file beside it and the
  worktree setup in a script run through `make`.** (R16)
  - **Why:** the section is 60% of the skill and most runs execute one step; the docs advise
    supporting files read on demand. A script runs the same each time, where a block copied from
    text into a prompt can drift.
  - **Cost accepted:** a parallel run reads one more file; the script is code the ticket adds,
    reviewed as a behaviour step.
  - **Reversal:** one commit (inline the file and the block again).
  - **Rejected:**
    - a separate skill for parallel steps — splits one procedure across two entry points.

## Risks

- **The rewrite drops a line Claude needed.** Guidance gets worse with less text, against the
  goal. *Contained by:* the step ledger (R3, R14), review of each "dropped:", and the measured
  slices compared with the step's behaviour in later sessions.
- **The trimmed rules miss 20% on a module's `.ts` edit.** The 30% is the audit's estimate.
  *Contained by:* D6 measures it in the step that trims; a shortfall is reported, and the step
  cuts further or the lever is reported under the threshold for the user's call.
- **A reviewer misses a rule because its filter is too narrow.** With D2 the Standards reviewer no
  longer reads every rule. *Contained by:* the filters stay as broad as today (D1); `rule-paths`
  catches a filter that matches nothing.
- **The worktree script diverges from the block it replaces.** A parallel step gets wrong ports
  or a shared `.env`. *Contained by:* the R16 seam compares the script's `.env` with the old
  block's on a scratch worktree, refusals included.
- **The limits line in `claude-md.md` is reworded.** `doc-limits` exits 2. *Contained by:* the
  error names the line it expects (D5).
- **Text written before `modular-monolith` settles goes stale at once.** *Contained by:* the plan
  starts after that ticket's verification passes.
