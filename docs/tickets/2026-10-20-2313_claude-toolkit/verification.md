# Claude toolkit — verification

> Ticket: `2026-10-20-2313_claude-toolkit` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-10-21 — run 1

**Verdict:** pass

Branch `chore/claude-toolkit` at `8deead0`, 12 commits over `origin/main` (`d142143`). `make check`:
Biome 157 files, `tsc -b` clean, vitest 26 files / 290 tests; `lychee` 0 errors; the tree clean.
The reports below are condensed from the three agents' output (verifier, Standards reviewer, Spec
reviewer); every path is theirs.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass* | `CLAUDE_PROJECT_DIR=/nonexistent sh .claude/hooks/make-check.sh` prints the message and the `BLOCKED:` hint on stderr, exit 2; `BLOCKED: x` and a green tree exit 0. *But see Spec (c1): `implementer.md:12` runs the hook by a path under `CLAUDE_PROJECT_DIR`, so a wrong value fails to find the script (exit 127, which does not block) before the new branch runs |
| R2 | pass | the R2 `git grep` is empty; `merge-base HEAD origin/main` in `verifier.md:18`, `explain/SKILL.md:15`, `ticket-verify/SKILL.md:17` |
| R3 | pass | always loaded: `CLAUDE.md`, `commits.md`, `sdd.md`, `tooling.md`, 140 lines; `pull-requests.md` has `paths: [".github/**"]`; the six toolkit constraints in `claude-md.md:50-65`; every cut line has an owner (`settings.json › deny`, `docs/knowledge/tooling.md`, `.gitignore`) |
| R4 | pass | `claude-md.md` lists `docs/knowledge/**`, not `docs/**`; `Bun.Glob` matches no `docs/tickets/` path; `Bun.YAML.parse` reads every rule's frontmatter as a `paths` list; `claude -p --debug-file` (v2.1.304) logs no error or warning |
| R5 | pass | roadmap rows 2 and 13 link this folder, row 3 reads `done`, entry 12 names the deferred toolkit items |
| R6 | pass | `ls docs/tickets` lists the six folders in start order, `_template` last; both acceptance greps empty; each time matches the ticket's first commit on `chore/enterprise-template`; `git log --follow` on `chat-core/feature.md` reaches the commits under the old name |

**Not verifiable:** what a live session loads (`/context` in a fresh session, by hand: the
always-loaded set without `pull-requests.md`); whether Claude Code acts on the hook's exit 2 (a real
`/ticket-implement` run); the hook's red path, which needs a broken tree.

### Review

#### Standards

One hard violation, seven judgement calls; all 12 commit messages pass `commits.md`.

- **Hard:** decisions missing from `architecture.md › Decisions` (`sdd.md › Gates`): S5's two
  (web reads move to allow; `git commit` stays in ask) and S3.2's (`--no-verify` lives in `deny`,
  not a rule line). The file stops at D4.
- S5 has no `R…`; only a Scope bullet backs it.
- `settings.json` allows `git rm *`, `git mv *`, `git branch*`, which include `rm -f`, `mv -f` and
  `branch -M`, and nothing in ask catches them.
- The `deny` patterns `git commit *--no-verify*` and `git commit * -n*` match text inside a `-m`
  message; this branch's own S3 bodies would be denied.
- `tooling.md:3` says "Imperatives only", yet S3 moved the *New workspace* checklist and the
  quoting rule into the knowledge doc, and `packages/CLAUDE.md:12` points an agent there.
- The folder pattern is still written out in nine places, `docs/knowledge/sdd.md:17` among them.
- `ticket-feature/SKILL.md:3` says `<date-time>_<slug>`, every other place `<YYYY-MM-DD-HHmm>`.
- `36b767b` fixes two bugs, which `commits.md` maps to `:bug: fix`, not `:wrench: chore`.

#### Spec

All acceptance checks pass; no scope creep of substance.

- **(a1)** R3's "`tooling.md` SHALL state nothing that … `docs/knowledge/tooling.md` already …
  owns": the kept lines on `.env`, the single `Makefile` and the catalogs are also in the doc,
  while the quoting line was cut for the same reason. The verifier reads the doc as giving
  imperatives to the rule (`docs/knowledge/tooling.md:3-5`), so no fail.
- **(a2)** The cut `sdd.md` bullet named "an issue tracker" among the plugin paths to ignore; its
  owner `CLAUDE.md:24-25` names only `.scratch/` and `docs/superpowers/`.
- **(c1)** R1 cannot fire in the case `feature.md` names ("a wrong `CLAUDE_PROJECT_DIR` releases
  `implementer`"): the hook path itself depends on the variable, and the Seam calls `sh` on the
  script directly, so it misses this. `cd … 2>/dev/null` also hides the shell's reason.
- **(c2)** S5 against its Scope line: `git switch -f`/`-C`, `git rm -f`, `sort -o` and an unbounded
  `WebFetch` run without a prompt.
- **(c3)** The `deny` entries match commit message text (as Standards).

### Simplifications

1. Return the `--no-verify` deny to the prefix forms `git commit --no-verify*` and
   `git push --no-verify*`, and drop the two `-n` patterns (`.claude/settings.json`): no false
   denials on message text; CI still fails a skipped hook.
2. Point `docs/knowledge/sdd.md:17` at `.claude/rules/sdd.md` instead of restating the folder
   pattern: one place fewer for the next rename.
3. Cut roadmap entry 13 to its Status line: R6 and D4 now own its Goal, Scope and Facts.

Applied in S6: 2 and 3, with Standards' hard violation (D5, D6), Spec (a2) and `git commit` moved
to `allow`; 1 declined by the user; Spec (c1) and (c2) recorded in the findings of S1 and S5.

### Lessons

| Lesson | Evidence | Proposed change | Applied |
|---|---|---|---|
| An acceptance or Verify command was broken as written, and only the implementer found out | S1 (the `ugrep` shim matched nothing; the pattern missed `main...HEAD`), S2 (the grep read the rule body; `node_modules/effect` does not exist), S4 (a trailing `/` excluded nothing; the grep matched its own line) | `ticket-plan`: run every Verify and acceptance command once before the plan is presented, with `git grep` or `command grep`, and show it can go red | no |
| A plan fixed a fact nobody had checked | S2 (no root `node_modules/effect`), S3 (budget 138, landed 140; 2.8k tokens, `/context` says 4.5k), S1 (the hook path the Seam skipped) | already roadmap entry 14 (`ticket-plan`: a file or API only after `researcher` confirmed it); no new line | — |
| Every step review reported `plan.md` Status and findings as missing, which the main session writes at approval | S1.2, S2.2, S3, S4 | `ticket-implement` step 3: the review does not report `plan.md` Status or findings | no |
