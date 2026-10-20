# Claude toolkit — plan

> Ticket: `2026-10-20_claude-toolkit` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- Branch `chore/claude-toolkit`; one commit per step, after the user's OK (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.
- Every step is docs and config: `make check` guards `make ids`, the link check guards the moved
  pointers, and each step's *Verify* holds the acceptance command of its requirement.
- Every cut line names its owner in the step's findings (`settings.json › deny`, `.gitignore`,
  `docs/knowledge/tooling.md`), so a cut can be traced back.
- The second wave (`feature.md › Open questions`) joins this plan as further steps once S1–S3 are
  reviewed; S1–S3 are independent and may run in any order.

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
  `grep -rnE '(^|[^a-z/._-])main([^a-z._-]|$)' .claude/skills .claude/agents | grep -v 'main session'`
  is empty; `git grep -n 'merge-base HEAD origin/main' -- .claude` lists `ticket-verify`,
  `verifier` and `explain`.
- **Status:** todo

#### S2 — `paths:` match only the workspaces and the living docs

- **Goal:** reading `node_modules/**/*.d.ts` or `repos/effect` loads none of the Effect, naming
  or comments rules, and editing a ticket artifact loads no `claude-md.md` (R4; D1).
- **Blocked by:** none.
- **Files:** `.claude/rules/{effect,effect-schema,effect-services,effect-style,naming,comments}.md`
  (`**/*.ts` → `{domain,http-api,application,infrastructure,packages,apps,deployment}/**/*.ts`;
  `naming.md` keeps `package.json` as the root file plus the same directories);
  `.claude/rules/effect-tests.md` (`**/*.test.ts`, `**/testing/**` → the same prefix);
  `.claude/rules/claude-md.md` (`docs/**` → `docs/knowledge/**`);
  `docs/knowledge/tooling.md › Add a workspace` (a new top-level layer adds its directory to the
  `paths:` of those rules; `packages/*` and `apps/*` are covered). `use-cases.md` is already
  scoped and does not change.
- **Test first:** `config only`.
- **Verify:** `make check`; every `paths:` entry of `effect*.md`, `naming.md` and `comments.md`
  starts with a workspace directory or a brace list of them, or is `package.json`;
  `grep -n 'docs/' .claude/rules/claude-md.md` shows `docs/knowledge/**` only; each edited
  frontmatter still opens and closes with `---` and parses as a YAML list (`bun -e` over the
  file, or `claude --debug` in a fresh session, which must report no frontmatter error);
  by hand, in a fresh session: read `node_modules/effect/package.json`, then `/context` lists no
  rule of ours.
- **Status:** todo

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
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1 |
| R2 | S1 |
| R3 | S3 |
| R4 | S2 |
| R5 | landed with `feature.md` (roadmap entries 2, 3, 12); re-checked at `/ticket-verify` |
