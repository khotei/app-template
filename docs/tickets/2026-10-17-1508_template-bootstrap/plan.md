# Template bootstrap — plan

> Ticket: `2026-10-17-1508_template-bootstrap` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- Branch `chore/effect-setup` in `~/lab/oblik`, pushed as `chore/enterprise-template` (D1, D2, D4):
  this ticket has no `chore/template-bootstrap` branch, and `/ticket-implement` accepts the branch
  named here. After S4 the working copy is the fresh clone `~/lab/app-template` on
  `chore/enterprise-template`; the Claude session restarts there.
- S1–S3 and S7 are ordinary steps: one commit each, after the user's OK, `make check` green,
  ≤ ~400 changed lines (`bun.lock` excluded).
- **S4, S5, S6 and S8 are repository operations without a commit.** They run in the main session,
  not through `implementer`: `gh repo create`, `git push`, `git switch`, `git branch -D` and
  `git remote` need the user's OK (`.claude/settings.json › ask`), and a subagent cannot ask. Every
  such command runs alone, after the OK, and its *Verify* line is the gate. Their `Status` is
  recorded in S7's commit; S8 runs after the last commit, so S7 sets it to `blocked: squash merge`
  and its evidence is `git log -1 main` in the new repository.
- `/ticket-verify` runs between S6 and S7, in a new session in the clone (rule files change in
  S1). S7 is the commit that carries its `verification.md`.
- Nothing is pushed to `origin` of `oblik`. The only remote written is `template`, named in every
  push.
- `lychee` is not installed locally (checked 2026-10-17): `brew install lychee` once, or read the
  CI `links` job after S4; it is a developer tool, not a repository dependency.
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Steps

#### S1 — Rules and skill: the roadmap entry and the teaching branch

- **Goal:** `/ticket-feature` starts from a roadmap entry, and the rules describe the teaching
  branch with its why (R15, R16, R17; D3).
- **Blocked by:** none.
- **Files:** `.claude/rules/sdd.md` (one bullet under *Artifacts*), `.claude/rules/pull-requests.md`
  (one bullet after the PR-body bullets), `.claude/skills/ticket-feature/SKILL.md` (step 1 reads the
  entry, step 3 sets its status to the ticket link), `docs/knowledge/sdd.md` (new section *Roadmap
  and the teaching branch*: why steps live next to a clean `main`, the branch picture as a Mermaid
  `gitGraph`, the three commands), `docs/knowledge/roadmap.md › How a ticket flows` (the
  teaching-branch bullet keeps one sentence and links the new section: one author per fact).
- **Test first:** `config only` (docs). The sentences are the ones quoted in
  `architecture.md › Contracts › Rule and skill text`.
- **Verify:** `make check`; `lychee --offline README.md 'docs/**/*.md' '.claude/**/*.md'`;
  `wc -l .claude/rules/sdd.md .claude/rules/pull-requests.md` ≤ 80 each; the dependency map is
  byte-identical:
  `diff <(git show HEAD:docs/knowledge/sdd.md | sed -n '/^### Dependency map/,/^### What the wrappers/p') <(sed -n '/^### Dependency map/,/^### What the wrappers/p' docs/knowledge/sdd.md)`
  prints nothing; `grep -lP '\p{Cyrillic}'` on the five files prints nothing.
- **Status:** done
- **Findings:**
  - Review (Standards) found the roadmap-entry fact written three times. The knowledge section now
    links `roadmap.md`, which owns it, and the rule keeps the imperative.
  - The skill now guards both roadmap steps with "if the slug has one", matching the rule's "when
    one exists". It gained a *Paths* row and the re-verification of dated facts that the
    roadmap's *Facts expire* bullet promised. `architecture.md › Rule and skill text` was updated
    to the guarded text.
  - "Never rebase the teaching branch" moved from the knowledge doc into `pull-requests.md`.
    The knowledge doc keeps only the why.
  - The `gitGraph` was checked by reading only. A `mermaid` parse probe was denied by the
    permission system.
  - The dependency map held byte-identical, as the R15/R16 acceptance then asked, though
    `/ticket-feature` had begun to write `docs/knowledge/roadmap.md`. Verification run 1 found the
    stale *Writes* cell; S6a corrects it.

#### S2 — Rename `@oblik` → `@app-template`

- **Goal:** one token names the project wherever a name is an identifier, and nothing outside
  `docs/tickets/`, `repos/` and `bun.lock` says `oblik` (R8, R9, R10, R12; D5, D6).
- **Blocked by:** none.
- **Files:** the 46 files `git grep -il oblik -- ':!docs/tickets' ':!repos' ':!bun.lock'` lists at
  `HEAD` (171 occurrences), plus `bun.lock`. In order:
  1. Record the baseline: `make dev-api` in the background, `curl -s localhost:3000/health` saved to
     `$CLAUDE_JOB_DIR/tmp/health-before.json`, then stop it.
  2. Scripted pass over `git ls-files` minus the three exclusions: `@oblik/` → `@app-template/`
     (package names, `workspace:*` dependencies, `.ts` import specifiers, Biome
     `noRestrictedImports` globs and messages, `Makefile --filter`, `.claude/rules/naming.md`,
     `.claude/rules/tooling.md`, layer `CLAUDE.md` files, `docs/knowledge/architecture.md`,
     `docs/knowledge/tooling.md`). The script is not committed (D5).
  3. By hand, the slug sites: root `package.json` name `app-template`;
     `deployment/shared/naming.ts` `projectName = 'app-template'`; `deployment/Pulumi.yaml`
     `name: app-template` and description *App Template infrastructure on AWS*;
     `deployment/local/docker-compose.yml` `name: app-template`; `.env.example` placeholders
     (`app-template` database user, password and name, `app-template-documents`,
     `app-template-jobs`); `packages/queue/queue.test.ts` temp prefix `app-template-queue-`.
  4. By hand, the product-name sites: `apps/web/src/index.html` title *App Template*;
     `.github/PULL_REQUEST_example.md` line 42; `CLAUDE.md` and `README.md` title *App Template*
     and the product sentence replaced by one line for the chat clone and its purpose as a template
     (the README's structure is S3's).
  5. `bun install`, then `bun install --frozen-lockfile`.
- **Test first:** Seam `git grep -il oblik -- ':!docs/tickets' ':!repos' ':!bun.lock'` — red: 46
  files at `HEAD`; green: nothing. Seam `make check` after the rename.
- **Verify:** `make check`; `git grep -il oblik -- ':!docs/tickets' ':!repos' ':!bun.lock'` empty;
  `git grep -n "Oblik+" -- ':!docs/tickets'` empty; `grep -c oblik bun.lock` is 0 and
  `grep -c '"@app-template/' bun.lock` non-zero; `git diff bun.lock | grep '^[-+]' | grep -v
  'oblik\|app-template\|^---\|^+++'` empty (V2: name lines only, no version drift);
  `git diff -- '*.ts' | grep '^[-+]' | grep -v '@oblik/\|@app-template/\|oblik-queue\|app-template-queue\|projectName\|^---\|^+++'`
  empty (import specifiers and the two literals only; `#<workspace>/*` untouched); `make dev-api`
  then `curl -s localhost:3000/health` equals `health-before.json` (R9); `wc -l CLAUDE.md` ≤ 40;
  `make ids`.
- **Status:** done
- **Findings:**
  - Biome rewrapped the import in `application/example/example.service.ts` past 100 columns, so
    the `.ts` filter shows four lines of it. The imported names are unchanged.
  - `bun.lock`: Bun re-sorted the workspace entries and kept the root name `oblik`. That line was
    edited by hand, and `--frozen-lockfile` passes. The V2 filter shows only moved blank lines.
  - Seven `Context.Service` keys carry the scope and were renamed, as R8 requires.
    `architecture.md › Structure › Not touched` now names them.
  - `deployment/CLAUDE.md` (resource-name pattern) and `README.md` (the old *Starting a new
    project* line) were renamed too. They were among the 46 files, though not in the hand lists.
  - `make help` printed no product name, so R10's Makefile clause had nothing to rename. The help
    target now prints an `App Template: make <target>` header.
  - The `/health` body is `{"status":"ok"}` before and after.
  - S2's *Verify* had no Cyrillic check. One was run with `perl`, because macOS `grep` has no
    `-P`. S3 and S7 use `perl -CSD -ne 'print "$ARGV\n" if /\p{Cyrillic}/'`.
  - For `postgres-drizzle`: the slug in `.env.example` makes the Postgres user and database
    `app-template`, a name that SQL must quote. `app_template` avoids that, so decide it there.
  - For `claude-toolkit`: two layer-doc lines restate code, so the rename forced edits to them
    (`claude-md.md`: delete such lines). They are `deployment/CLAUDE.md`'s resource-name
    pattern and `domain/CLAUDE.md`'s Biome sentence. R10 kept them for this ticket.


#### S3 — Licence, README, superseded `effect-setup`

- **Goal:** the tree reads as a template's: MIT licence, a README with the branch model and the
  roadmap, and `effect-setup` closed by a note (R1 licence, R11, R14, R17; D2, D7).
- **Blocked by:** S2 (the README's first lines are renamed there).
- **Files:** `LICENSE` *(new; MIT, `Copyright (c) 2026 Vitalii Khotei`)*; `README.md` (keep *Quick
  start*; add *Branches*: what `main`, `chore/monorepo-setup` and `chore/enterprise-template` hold;
  add a *Roadmap* row to *Where to read next* linking `docs/knowledge/roadmap.md`; replace
  *Starting a new project* with a pointer to roadmap entry 12 `template-handoff` and *Use this
  template → Include all branches*); `docs/tickets/2026-10-16-1607_effect-setup/plan.md` and
  `feature.md` (one line under each title: superseded at S12, link to
  `docs/knowledge/roadmap.md#re-homing-effect-setup`).
- **Test first:** `config only` (docs).
- **Verify:** `make check`; `lychee --offline README.md 'docs/**/*.md' '.claude/**/*.md'`;
  `make ids`; `head -5` of both `effect-setup` files shows the note and
  `git diff --stat HEAD -- docs/tickets/2026-10-16-1607_effect-setup` touches only those lines;
  `grep -c 'Vitalii Khotei' LICENSE` is 1; the `perl` Cyrillic check on the changed files prints
  nothing; `git grep -il oblik -- ':!docs/tickets' ':!repos' ':!bun.lock'` still empty.
- **Status:** done
- **Findings:**
  - Review found that the README's *Branches* row for `chore/enterprise-template` claimed a
    `--no-ff` merge per ticket, which the bootstrap does not have. The row now says only what the
    branch holds, and the linked `sdd.md` section owns the mechanism.
  - "Include all branches" copies every branch, not three. The README says so. Whether it works
    is checked by hand in S8.
  - The superseded note is one line of 118 characters, because R14 and D7 ask for one line.


#### S4 — Create `khotei/app-template` and push the three branches

- **Goal:** the public repository exists with its settings, and `main`, `chore/monorepo-setup`
  and `chore/enterprise-template` point where R4 says (R1, R2, R3, R4, R5; D2).
- **Blocked by:** S1, S2, S3 (the push carries them).
- **Files:** none; repository operations, each after the user's OK:
  1. Snapshot `oblik`'s remote for S6: `git ls-remote origin > $CLAUDE_JOB_DIR/tmp/origin-before.txt`.
  2. `gh repo create khotei/app-template --public --description "Effect v4 modular monolith on Bun: a chat clone built as a template for enterprise projects"`
     — no `--license`, `--add-readme`, `--source` (D2).
  3. `gh repo edit khotei/app-template --add-topic template --add-topic effect --add-topic bun --add-topic typescript --add-topic tanstack --add-topic pulumi --add-topic aws --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --squash-merge-commit-message pr-title-description --template --enable-wiki=false --enable-projects=false`.
     **Not yet `--delete-branch-on-merge`:** the bootstrap PR's head *is* the teaching branch, and
     GitHub would delete it at the merge; S8 enables it afterwards.
  4. `git remote add template git@github.com:khotei/app-template.git`.
  5. `git push --dry-run template main chore/monorepo-setup chore/effect-setup:chore/enterprise-template`,
     then the same without `--dry-run` (V3: `husky pre-push` runs `make test` once).
  6. `gh repo edit khotei/app-template --default-branch main`.
- **Test first:** Seam `git ls-remote template` — red: lists nothing on the empty repository (no
  initial commit was written); green after the push: exactly `HEAD`, `refs/heads/main`,
  `refs/heads/chore/monorepo-setup`, `refs/heads/chore/enterprise-template`.
- **Verify:** `git ls-remote template` shows `main` at `1bbdd1a…`, `chore/monorepo-setup` at
  `c0bc48f…`, `chore/enterprise-template` at `git rev-parse chore/effect-setup`, `HEAD` → `main`,
  and no `chore/effect-setup`;
  `gh repo view khotei/app-template --json visibility,description,repositoryTopics,licenseInfo`
  (PUBLIC, the description, seven topics, MIT);
  `gh api repos/khotei/app-template --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,squash_merge_commit_title,squash_merge_commit_message,is_template,default_branch}'`
  — `squash_merge_commit_title` must be `PR_TITLE` (V1; else one `gh api -X PATCH`);
  `git ls-remote origin | diff - $CLAUDE_JOB_DIR/tmp/origin-before.txt` empty.
- **Status:** done
- **Findings:**
  - Evidence: [verification.md › run 1](./verification.md#2026-10-17--run-1), rows R1–R5. `chore/enterprise-template`
    was pushed at `aa4cf0f` (S3), and `origin` of `oblik` was unchanged afterwards.
  - V1 held: `gh api` shows `squash_merge_commit_title` `PR_TITLE` and
    `squash_merge_commit_message` `PR_BODY`.
  - `licenseInfo` was `null`, so the licence check moved to S8 (S6a's findings).

#### S5 — Fresh clone: setup, check, health

- **Goal:** the template works without `oblik`'s local state, and the teaching branch carries the
  15 `effect-setup` commits followed by this ticket's (R4, R9; D1).
- **Blocked by:** S4.
- **Files:** none, unless the clone fails: then the fix is a commit on `chore/enterprise-template`
  in the clone, pushed to `origin` (= `khotei/app-template`), and recorded as a finding here.
- **Test first:** Seam fresh clone —
  `git clone -b chore/enterprise-template git@github.com:khotei/app-template.git ~/lab/app-template && cd ~/lab/app-template && make setup && make check`.
- **Verify:** `make check` green in the clone; `git log --oneline 1bbdd1a..chore/enterprise-template`
  ends (oldest first) with the 15 `effect-setup` commits from `f77ff022c` to `654bda978`;
  `bun install --frozen-lockfile`; `make dev-api` then `curl -s localhost:3000/health` equals
  `health-before.json`; `git remote -v` in the clone names only `origin` →
  `khotei/app-template`. The Claude session moves to `~/lab/app-template` from here.
- **Status:** done
- **Findings:**
  - Evidence: [verification.md › run 1](./verification.md#2026-10-17--run-1), rows R4 and R9. The clone needed no fix
    commit; `git remote -v` names only `origin` → `khotei/app-template`.
  - For `chat-core` (R35–R36, signals): the `bun` process outlived `make dev-api` and was stopped
    by hand.

#### S6 — Clean up `oblik`

- **Goal:** `oblik` is back to its own state, with no trace of the transfer (R7).
- **Blocked by:** S5 (R7's condition: R4 holds and `make check` passes on the fresh clone).
- **Files:** none; in `~/lab/oblik`, each after the user's OK: `git switch main`;
  `git branch -D chore/effect-setup backup/effect-setup-simplified` (`-D`: neither is merged into
  `main`); `git remote remove template`.
- **Test first:** Seam `git branch --list 'chore/effect-setup' 'backup/*'` — red: two branches;
  green: empty.
- **Verify:** `git branch --list 'chore/effect-setup' 'backup/*'` empty; `git remote` prints only
  `origin`; `git status` clean on `main`; `git log origin/main..main` empty;
  `git ls-remote origin | diff - $CLAUDE_JOB_DIR/tmp/origin-before.txt` empty.
- **Status:** done
- **Findings:**
  - Evidence: [verification.md › run 1](./verification.md#2026-10-17--run-1), row R7. The order R7 asks for (the clone's
    `make check` before the deletions) shows only in the timestamps, 16:28 then 16:30.
  - `oblik` keeps `stash@{2026-10-17 12:10:18}` (*S14 removal + Docker ticket edits*), older than
    this ticket and the last trace of `chore/effect-setup`. Keeping it is the user's call.

> `/ticket-verify docs/tickets/2026-10-17-1508_template-bootstrap` runs here, in a new session in
> `~/lab/app-template`. Accepted fixes become steps before S7.

The run on 2026-10-17 accepted three fixes, S6a–S6c, from `verification.md` (committed in S7):
*Simplifications* 1–3 and all four *Lessons*. The user later rejected the `make english` lesson
and moved S6c to roadmap ticket `claude-toolkit`, whose scope is the rules, agents and hooks.
Simplification 4 (drop the unused `@effect/platform-bun` pin) was dropped:
`chat-core` consumes it through `BunRuntime` (`docs/knowledge/roadmap.md › 3. chat-core`), so
it would only be added back. The run also moved the licence check from S4 to S8's *Verify*
(S6a's findings). Ordinary steps, through `implementer`, one commit each, in the clone on
`chore/enterprise-template`.

#### S6a — Make the spec agree with the rules

- **Goal:** the dependency map tells the truth about `/ticket-feature`, and the bootstrap PR title
  is a pair from `commits.md` (R15, R16; verification Spec c1, c2).
- **Blocked by:** none.
- **Files:** `docs/knowledge/sdd.md` (the map's `/ticket-feature` *Writes* cell gains
  `docs/knowledge/roadmap.md`); `feature.md` (*Rules this ticket changes*: the map changes in that
  one cell; the R15/R16 acceptance row: "the dependency map differs only in that cell");
  `architecture.md` (`docs/knowledge/sdd.md` row of *Structure*; *The bootstrap PR* title; the
  pair and its reason as [D9](./architecture.md#decisions)); `plan.md` (S1's *Findings* note and
  S8's `gh pr create` title).
- **Test first:** `config only` (docs).
- **Verify:** `make check`; `lychee --offline README.md 'docs/**/*.md' '.claude/**/*.md'`;
  `git diff HEAD~1 -- docs/knowledge/sdd.md` touches only the `/ticket-feature` map row;
  `git grep -nE ':memo: chore\(' -- docs/tickets/2026-10-17-1508_template-bootstrap/{architecture,plan}.md`
  empty; the subject after the prefix is ≤ 50 characters.
- **Status:** done
- **Findings:**
  - D2 and S4's *Verify* assumed GitHub detects MIT at the push. It reads `LICENSE` from the
    default branch only, and `main` gains the file at the squash, so the licence check moved to
    S8's *Verify* (verification run 1, R1).
  - The planned `git grep -n ':memo: chore'` matched its own line in this *Verify*, so it could
    never be empty. The pattern is now `':memo: chore\('` under `-E`: the backslash in the
    command's text breaks the self-match, and the real title still matches.

#### S6b — Retire the docs that describe the pre-Effect wiring

- **Goal:** no rule, `CLAUDE.md` or knowledge doc names `src/layer.ts`, `createLayer()` or
  `statusByTag` as current (verification Standards 1, 2; Simplification 1).
- **Blocked by:** none.
- **Files:** `apps/CLAUDE.md` (drop the `src/layer.ts` clause of the `main.ts` bullet and the
  `_tag` → status bullet; `chat-core` decides error mapping on `HttpApi`); `.claude/rules/naming.md`
  (drop "its composition root: `src/layer.ts`"; drop `layer.ts` from the bare-name examples);
  `docs/knowledge/architecture.md` (drop "and composition roots (`layer.ts`)" from the `apps/*`
  row of the layer table; delete *The Effect seam*, whose content is now false, and its anchor
  links; the *In transition* box stays as a pointer, now to roadmap ticket `chat-core`, which
  replaces `example` with `chat` as the worked example, instead of the closed `effect-setup`).
  Per `claude-md.md`, the lines a refactor made false are deleted, not updated; the box is a
  pointer to the ticket that rewrites steps 6–8, so only its target changes.
- **Test first:** Seam `git grep -n -e 'layer\.ts' -e createLayer -e statusByTag -- ':!docs/tickets' ':!repos'`
  — red: hits in the three files; green: only the *In transition* box and the steps 6–8 it
  flags, which `chat-core` rewrites.
- **Verify:** `make check`; `lychee --offline README.md 'docs/**/*.md' '.claude/**/*.md'`;
  `wc -l apps/CLAUDE.md` ≤ 40; `.claude/rules/naming.md` ≤ 80 lines;
  `git grep -n 'the-effect-seam' -- ':!docs/tickets' ':!repos'` empty.
- **Status:** done
- **Findings:**
  - The `the-effect-seam` check was unscoped, so it matched its own line here and the closed
    ticket's history; it now has the seam's two exclusions.
  - `effect-setup`'s `feature.md` still links the deleted anchor. Repointing it was tried and
    reverted: R10 and R14 forbid editing that folder, and CI's `lychee --offline` does not
    check fragments.

#### S6c — Apply the verification lessons

- **Goal:** three of the four lessons become one skill line, one agent line and one mechanical
  check (verification *Lessons*; the user rejected the `make english` lesson).
- **Blocked by:** none.
- **Files:**
  - `.claude/skills/ticket-plan/SKILL.md` step 3: "Check every literal the plan fixes (titles,
    'unchanged' claims, expected outputs) against `.claude/rules/*` and against what exists at
    that step."
  - `.claude/agents/implementer.md › Disciplines`: "Before a doc states a fact, `git grep` for it;
    if another doc owns it, link it (`claude-md.md › One author per fact`)."
  - `.husky/commit-msg`: fail on a body line over 72 columns; the subject, `#` comments, lines
    holding a URL and the trailing trailer block are exempt.
  - `docs/knowledge/tooling.md`: the `commit-msg` hook row.
- **Test first:** Seam `.husky/commit-msg <file>` — red on a body line of 73 columns, green on
  `git log -1 --format=%B aa4cf0f` and on a message whose long line is a URL.
- **Verify:** `make check`; `lychee --offline README.md 'docs/**/*.md' '.claude/**/*.md'`; the
  seam red then green, probes deleted; `git log -1 --format=%B 4c8f9cb | .husky/commit-msg
  /dev/stdin` fails (the known 73-column line); the dependency map is unchanged (no skill, agent
  or hook gains a dependency).
- **Status:** moved to roadmap ticket `claude-toolkit` (user, 2026-10-17)

#### S7 — Record the verdict and close the roadmap entry

- **Goal:** the ticket's documents say what happened: the verdict, the statuses of S4–S6, the
  roadmap's ticket 1 as *done* (R13; D1, D12).
- **Blocked by:** S6, `/ticket-verify`, S6a, S6b.
- **Files:** `docs/tickets/2026-10-17-1508_template-bootstrap/verification.md` (written by
  `/ticket-verify`; *Lessons › Applied* → `yes (S6c)` for the four lessons), `plan.md` (S4–S6
  `done` with findings, S8 `blocked: squash merge`), `docs/knowledge/roadmap.md` (ticket table
  row 1 and the entry's *Status*: `done`, link to the ticket folder). In the clone, on `chore/enterprise-template`, pushed to `origin` after the OK.
- **Test first:** `config only` (docs).
- **Verify:** `make check`; `lychee --offline README.md 'docs/**/*.md' '.claude/**/*.md'`;
  `make ids`; the roadmap's ticket table still has 12 rows and the re-homing table maps R23–R40;
  `git push origin chore/enterprise-template` then `git ls-remote origin chore/enterprise-template`
  equals `git rev-parse HEAD`; the `perl -CSD` Cyrillic check on the changed files prints nothing.
- **Status:** done
- **Findings:**
  - The three remaining lessons read `moved to claude-toolkit`, not `yes (S6c)`, and roadmap
    ticket 2 inherits them (S6c's status; D10).
  - The user put `chat-core` before `claude-toolkit`: ticket 3 depends on 1, not 2, because the
    Effect rules are written from real code. Ticket 2 said its Effect rules were written against
    the S1–S12 code, which `chat-core` replaces; it now names `chat-core`'s code and depends on
    1 and 3. `chat-core`'s first slice drafts `effect.md`, which ticket 2 polishes (D11).
  - The `.husky/commit-msg` Seam left `architecture.md` with S6c.
  - The push lines of *Verify* are left to the main session, after the user's OK.

#### S8 — The bootstrap PR and the first teaching merge

- **Goal:** `main` holds one squash with the S1–S12 state, the bootstrap and the subtree trailers,
  and `chore/enterprise-template` has that squash as an ancestor (R2 delete-on-merge, R6; D3, D4).
- **Blocked by:** S7.
- **Files:** none; in `~/lab/app-template`, each after the user's OK:
  1. `gh pr create --base main --head chore/enterprise-template --title ":sparkles: feat(template-bootstrap): Cut App Template from the Oblik+ scaffold" --body-file <body>`
     — the body per `.github/PULL_REQUEST_TEMPLATE.md`, plus the paragraph *Carried from
     effect-setup* (S1–S12) and, **outside the HTML comment**, the trailers
     `git-subtree-dir: repos/effect` and
     `git-subtree-split: 7f524e25cfb49a71ac39b0f44278d08d40dda5de`.
  2. `gh pr checks --watch` green, then `gh pr merge --squash` with no `--subject`/`--body`, so
     GitHub applies *pull request title and description*.
  3. `git fetch origin && git switch chore/enterprise-template && git merge main` (the `--no-ff`
     merge of the ticket branch is moot: the branch is the teaching branch), then
     `git push origin chore/enterprise-template`.
  4. `gh repo edit khotei/app-template --delete-branch-on-merge` (deferred from S4).
  5. By hand on GitHub: *Use this template → Include all branches* offers the three branches
     (R3).
- **Test first:** Seam `git merge-base main chore/enterprise-template` — red before the merge:
  `1bbdd1a…`; green after: equals `git rev-parse main`.
- **Verify:** `git log -1 --format=%B origin/main` is the PR title and body with both subtree
  trailers and no HTML comment; `git merge-base main chore/enterprise-template` equals
  `git rev-parse main`; `git diff main chore/enterprise-template --stat` empty (identical trees);
  `gh api repos/khotei/app-template --jq .delete_branch_on_merge` is `true`;
  `gh repo view khotei/app-template --json licenseInfo` is MIT (GitHub reads `LICENSE` from the
  default branch only, so S4 could not see it; verification run 1);
  `git ls-remote origin` still lists the three branches.
- **Status:** blocked: squash merge

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S3 (`LICENSE`), S4 (repository, description, topics) |
| R2 | S4 (squash only, message), S8 (delete on merge) |
| R3 | S4 (flag), S8 (checked by hand) |
| R4 | S4 (push and refs), S5 (history on the clone) |
| R5 | S4 |
| R6 | S8 |
| R7 | S6 |
| R8 | S2 |
| R9 | S2 (baseline and after), S5 (fresh clone) |
| R10 | S2 |
| R11 | S2 (title and product line), S3 (structure) |
| R12 | S2 |
| R13 | committed in `7bc90c6` before this plan; S7 (ticket 1 status) |
| R14 | S3 |
| R15 | S1, S6a (dependency map) |
| R16 | S1, S6a (dependency map) |
| R17 | S1, S2, S3, S7 (Cyrillic check in each *Verify*) |
