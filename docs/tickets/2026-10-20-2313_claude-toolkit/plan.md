# Claude toolkit — plan

> Ticket: `2026-10-20-2313_claude-toolkit` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- Branch `chore/claude-toolkit`; one commit per step, after the user's OK (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.
- Every step is docs and config: `make check` guards `make ids`, the link check guards the moved
  pointers, and each step's *Verify* holds the acceptance command of its requirement.
- Every cut line names its owner in the step's findings (`settings.json › deny`, `.gitignore`,
  `docs/knowledge/tooling.md`), so a cut can be traced back.
- S1–S3 are independent and may run in any order; S4 and S5 joined after S3, and the second wave
  went to roadmap entry 14.

## Steps

#### S1 — The gate blocks on its own failure, and the fixed point is `origin/main`

- **Goal:** `make-check.sh` exits 2 with a message when it cannot enter `CLAUDE_PROJECT_DIR`, and
  no skill or agent names a bare `main` as the fixed point (R1, R2).
- **Blocked by:** none.
- **Files:** `.claude/hooks/make-check.sh`; `.claude/skills/ticket-verify/SKILL.md` (step 1, the
  fixed point); `.claude/agents/verifier.md` (step 1, `git diff --stat`).
- **Test first:** Seam `make-check.sh` —
  `echo '{}' | CLAUDE_PROJECT_DIR=/nonexistent sh .claude/hooks/make-check.sh; echo $?` prints `1`
  today and must print a message naming the directory and `2`. Keep the two existing paths green:
  `echo '{"last_assistant_message":"BLOCKED: x"}' | sh .claude/hooks/make-check.sh` exits 0, and
  `echo '{}' | CLAUDE_PROJECT_DIR=$PWD sh .claude/hooks/make-check.sh` exits 0 on a green tree.
- **Verify:** the three commands above; `make check`;
  `git grep -nE -e '(^|[^a-z/._<-])main([^a-z_-]|$)' --and --not -e 'main session' --and --not -e 'no local .main.' -- .claude/skills .claude/agents`
  is empty; `git grep -n 'merge-base HEAD origin/main' -- .claude` lists `ticket-verify`,
  `verifier` and `explain`.
- **Status:** done
- **Findings:**
  - The Bash tool's `grep` is a `ugrep` shim that matches nothing on `(^|…)`, so the first R2
    command passed vacuously; it also missed `main...HEAD` and flagged prose. The acceptance
    became one `git grep` in `feature.md` and here (S1.2); R2 itself is unchanged. Verify and
    Acceptance commands use `git grep` or `command grep`.
  - Its two exclusions target `explain`: `<` in the leading class skips `<main class=…>` in
    `REPORT.md`, and `no local .main.` skips the prose of `SKILL.md:15`; rewording either line
    turns R2 red. Known blind spots: `HEAD..main`, a bare `main` on a line that also says
    `main session`, and untracked files.
  - `docs/knowledge/sdd.md` (the `/ticket-verify` row) is outside Files: it names `origin/main`
    since S1.2, one commit after the skill changed in S1.1.
  - The cd-failure message names the `BLOCKED:` way out, as the red path does.

#### S2 — `claude-md.md` matches only the living docs

- **Goal:** editing a ticket artifact loads no `claude-md.md`; the code rules keep `**/*.ts`
  (R4; D1).
- **Blocked by:** none.
- **Files:** `.claude/rules/claude-md.md` (`docs/**` → `docs/knowledge/**`).
- **Test first:** `config only`.
- **Verify:** `make check`;
  `awk '/^---$/{n++; next} n==1' .claude/rules/claude-md.md | command grep -n 'docs/'` shows
  `docs/knowledge/**` only; the edited frontmatter still opens and closes with `---` and parses as
  a YAML list (`bun -e` over the file, or `claude --debug` in a fresh session, which must report
  no frontmatter error).
- **Status:** done
- **Findings:**
  - S2.1 enumerated the workspace directories in the code rules' `paths:`; S2.2 reverted to
    `**/*.ts` (D1). The workspace-local `node_modules` are symlinks into `node_modules/.bun`
    (there is no root `node_modules/effect`), so the enumeration still matched library sources,
    and `paths:` has no negation. R4 shrank to its `docs/tickets/` half; Goal, Files and Verify
    followed.
  - The first Verify grep over `claude-md.md` also matched the rule's body table; the check now
    reads the frontmatter only.

#### S3 — The always-loaded set shrinks to what every session needs

- **Goal:** root `CLAUDE.md` plus the rules without `paths:` are at most 140 lines;
  `pull-requests.md` loads for `.github/**` only; the toolkit-layout constraints live in
  `claude-md.md`; `tooling.md` states nothing that `settings.json › deny`, `.gitignore` or
  `docs/knowledge/tooling.md` already enforces or owns (R3; D2, D3).
- **Blocked by:** none.
- **Files:** `.claude/rules/pull-requests.md` (frontmatter `paths: [".github/**"]`);
  `.claude/rules/sdd.md` (the *Toolkit layout* section removed, and the two *Artifacts* bullets
  that restate `CLAUDE.md › Working here`: the plugin paths and the glossary; without them the
  budget lands at 143); `.claude/rules/claude-md.md`
  (six condensed lines: skills are `disable-model-invocation: true` and there is no
  `.claude/commands/`; the plugin is referenced by name, never copied; a commit that changes what
  a skill or agent uses updates the map in `docs/knowledge/sdd.md`; tool limits live on the agent;
  subagents cannot ask the user, so grilling and approvals run in the main session; `implementer`
  ends only green or with `BLOCKED:`); `.claude/rules/tooling.md` (cut: the root and app script
  lists, `never bun test`, the package-manager line, the `tsc -b` emit line, the `--no-verify` line,
  the quoting line, the *New workspace* section); `.claude/settings.json` (`deny` gains
  `Bash(git commit --no-verify*)` and `Bash(git push --no-verify*)`, the mechanical owner of the
  cut line); `packages/CLAUDE.md` (the new-workspace pointer → `docs/knowledge/tooling.md › Add a
  workspace`); `CLAUDE.md` line 24 loses "Conventions, gates and the SDD flow live in
  `.claude/rules/`", which the loader makes a no-op.
- **Test first:** `config only`.
- **Verify:** `make check`; `cat CLAUDE.md $(grep -L '^paths:' .claude/rules/*.md) | wc -l` ≤ 140;
  `grep -c '^paths:' .claude/rules/pull-requests.md` is 1; `grep -n 'Toolkit layout'
  .claude/rules/sdd.md` is empty and `grep -n 'disable-model-invocation'
  .claude/rules/claude-md.md` is not; `wc -l .claude/rules/claude-md.md` ≤ 80;
  `grep -nE 'no-verify|npm|bun test|tsc -b emits|New workspace|Double-quote' .claude/rules/tooling.md`
  is empty; `grep -n 'no-verify' .claude/settings.json` lists the two `deny` entries;
  `lychee --offline README.md 'docs/**/*.md' '.claude/**/*.md' '*/CLAUDE.md'` reports 0 errors;
  by hand, in a fresh session: `/context` shows the always-loaded set without `pull-requests.md`.
- **Status:** done
- **Findings:**
  - The budget lands at 140, not 138: `CLAUDE.md` line 24 went whole, since its first half
    repeats `tooling.md › Commands` and keeping it left 141. Measured by `/context`, the
    always-loaded project files were 4.5k tokens before; characters / 4 had estimated 2.8k.
  - Owners of the cut lines: `bun test` and `npm`/`yarn`/`pnpm`, `settings.json › deny`;
    `--no-verify`, `deny` (any position, and `git commit -n`); the `tsc -b` emit, `.gitignore`
    and the knowledge doc's *TypeScript*; quoting, its *Environment*; *New workspace*, its *Add a
    workspace*; the scripts lists, its *Commands*, which gained the line in S3.2, as no owner held
    it; the plugin paths and the glossary, `CLAUDE.md › Working here`; the decisions home,
    `claude-md.md › Hard limits`.
  - `docs/knowledge/sdd.md` (the dependency-map guard now names `claude-md.md`) and
    `docs/knowledge/tooling.md` are outside Files.
  - `deny` is not a security boundary (`code.claude.com/docs/en/permissions`): it covers the
    invocations Claude usually produces; CI runs the hooks' checks, so a skipped hook fails there.
  - S3.2 restored "or spawn agents" in the toolkit line, renamed `claude-md.md` to cover the
    toolkit, and cut the `biome.json` sentence of `packages/CLAUDE.md`, which restated the doc it
    points to.

#### S4 — Ticket folders sort by start time

- **Goal:** ticket folders are named `<YYYY-MM-DD-HHmm>_<slug>`, the six existing ones renamed and
  every pointer updated (R6; D4).
- **Blocked by:** S3 (both edit `CLAUDE.md`, `sdd.md` and `claude-md.md`).
- **Files:** `git mv` of `2026-10-15_monorepo-setup` → `2026-10-16-1433_…`, `2026-10-16_effect-setup`
  → `2026-10-16-1607_…`, `2026-10-17_template-bootstrap` → `2026-10-17-1508_…`,
  `2026-10-17_chat-core` → `2026-10-17-1748_…`, `2026-10-19_aws-local` → `2026-10-19-1448_…`,
  `2026-10-20_claude-toolkit` → `2026-10-20-2313_…`; the pattern in `CLAUDE.md`,
  `.claude/rules/{sdd,commits,claude-md}.md`, `.claude/skills/ticket-feature/SKILL.md` (the
  folder row: `<now YYYY-MM-DD-HHmm>`), `.github/PULL_REQUEST_TEMPLATE.md`,
  `docs/tickets/_template/*.md` and `docs/knowledge/sdd.md`, which also gains one line on following
  an old `Refs:` path; the old names replaced in `README.md`, `docs/knowledge/{architecture,roadmap}.md`,
  `.github/PULL_REQUEST_example.md` and the ticket artifacts.
- **Test first:** `config only`.
- **Verify:** `make check`; R6's acceptance commands;
  `lychee --offline README.md 'docs/**/*.md' '.claude/**/*.md' '*/CLAUDE.md'` reports 0 errors;
  `git log --follow --oneline -- docs/tickets/2026-10-17-1748_chat-core/feature.md` reaches the
  commits made under the old name.
- **Status:** done
- **Findings:**
  - The R6 pathspec `':!docs/tickets/*claude-toolkit/'` excluded nothing (a trailing `/` matches
    no file); the acceptance uses `/*`, and the `<YYYY-MM-DD>_` grep takes the same exclusion,
    since it matched its own line. R6 itself is unchanged.
  - `monorepo-setup` R33 now names the new pattern, so the closed ticket no longer contradicts
    its folder; plan and verification lines of closed tickets name the new paths while their
    commits keep the old ones, which `docs/knowledge/sdd.md` explains in one sentence.
  - `monorepo-setup` takes 10-16-1433, its squash on the teaching branch; its first commit,
    `aa72463` (10-15), lives on `chore/monorepo-setup`, outside that history. The order holds.
  - The pattern is stated by `sdd.md`, `ticket-feature` (which creates the folder, in local time),
    the PR and ticket templates and `docs/knowledge/sdd.md`; `CLAUDE.md`, `claude-md.md` and
    `commits.md` now point to the folder instead of restating it. `ticket-feature`'s description
    named `<date>_<slug>`, which the acceptance grep could not catch.

#### S5 — Permissions ask only before irreversible acts

- **Goal:** read-only commands, web reads and reversible git commands run without a prompt;
  `ask` keeps commit, push, PR and the commands that discard work. Taken in at the user's request
  after S3; no `R…`.
- **Blocked by:** none.
- **Files:** `.claude/settings.json`.
- **Test first:** `config only`.
- **Verify:** `bunx biome check .claude/settings.json`; `ask` lists no `WebFetch` or `WebSearch`.
- **Status:** done
- **Findings:**
  - Rules from every settings file merge and run deny → ask → allow, first match wins, so the
    project's `ask: WebFetch(*), WebSearch(*)` overrode a user-level `allow` and prompted on
    every web read; the domain list in `allow` could never help.
  - `allow` gains the read-only shell and git commands, `git switch`, `mv`, `rm`, `reset` and
    `stash`; `ask` keeps their destructive forms (`reset --hard`, `switch --discard-changes`,
    `stash drop`/`clear`, `branch -D`/`-f`, `find -delete`/`-exec`), since ask wins over allow.
  - `git commit` stays in `ask` at the user's choice: the one mechanical guard behind the
    approval gate.

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1 |
| R2 | S1 |
| R3 | S3 |
| R4 | S2 |
| R5 | landed with `feature.md` (roadmap entries 2, 3, 12) and entry 13 with R6; re-checked at `/ticket-verify` |
| R6 | S4 |
