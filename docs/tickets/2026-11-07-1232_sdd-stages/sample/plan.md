# New ticket from a title — plan

> Ticket: `2026-01-01-0000_sample` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

### Stage 1 — `make ticket` creates a ticket from its title · completes R1, R2, R4

| Step | Delivers | Serves | Size | Status |
|---|---|---|---|---|
| S1 | `make slug` prints a title's slug | R1, D1 | ~25, docs ~5 | todo |
| S2 | a long slug is cut after a whole word | R2 | ~10 | todo |
| S3 | `make ticket` creates the folder from the template | R4, D1 | ~35, docs ~5 | todo |

### Stage 2 — `make ticket` refuses a taken slug and names the next command · completes R3, R5, R6

| Step | Delivers | Serves | Size | Status |
|---|---|---|---|---|
| S4 | a taken slug is refused, nothing created | R5, D2 | ~15, docs ~2 | todo |
| S5 | accented letters become their base letters | R3 | ~5 | todo |
| S6 | `make ticket` prints the folder and the next command | R6 | ~10, docs ~2 | todo |

## How to run this plan

- Branch `chore/sample`; commits by round, under the commit gate of `.claude/rules/sdd.md ›
  Gates` (`/ticket-implement`).
- Each step is a whole deliverable, leaves `make check` green and fits one fresh session (≤ ~400
  changed lines of code and tests; its docs counted apart).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.
- A file is edited by one step, with one exception: both targets live in one module (D1, and
  `make lint` refuses the relative import a second module would need), so the steps share
  `.misc/tickets/ticket.mjs`, the `Makefile` and the targets' rows of `docs/knowledge/tooling.md`;
  each step's Files names what it changes there.

## Stage 1 — `make ticket` creates a ticket from its title

### Stage design

The facts:

- **A1** — confirmed by a probe: a recipe `@printf '%s\n' "$$TITLE"` run as
  `make t TITLE='Über "quoted"'` printed `Über "quoted"` (GNU Make 3.81).
- `docs/tickets/_template/` holds `feature.md`, `architecture.md`, `plan.md` and
  `verification.md`; `feature.md` opens with `# <Title>` (read).
- The lint scripts are ES modules run by Bun, a script's own run guarded by `import.meta.main`
  (read: `.misc/lint/rule-filters.mjs`).
- `make lint` refuses a relative import inside the root workspace; the root `package.json` maps
  only `#lint/*` (run: `bunx biome check` on a draft importing `./slug.mjs`).

The stage fixes `.misc/tickets/ticket.mjs`, exporting `buildSlug(title)` and run as
`bun .misc/tickets/ticket.mjs <command>` with the title in `TITLE`, `slug` printing the slug and
`ticket` creating the folder; and the targets `slug` and `ticket`, each with its `## ` help line.
Its choices:

- **A Bun ES module** — set aside: a POSIX shell script — fact: the lint scripts are `.mjs` run by
  Bun — used by: S1, S3
- **One module, a command per target** — set aside: a module per target, the second importing the
  first — fact: the relative import `make lint` refuses, and a `#tickets/*` subpath in the root
  `package.json` for one import — used by: S1, S3
- **The title read from the environment** — set aside: an argument `"$(TITLE)"` — fact: A1's
  probe — used by: S1, S3
- **The folder's time formatted in the script** — set aside: `date +%Y-%m-%d-%H%M` in the recipe —
  fact: D1 keeps the folder's name in one script — used by: S3

### Steps

#### S1 — `make slug` prints a title's slug

- **Delivers:** `make slug TITLE="<title>"` prints the title's words in lower case joined by
  hyphens, punctuation dropped; without a title it says what is missing.
- **Goal:** the slug of R1, built by the one function of D1 (R1, D1).
- **Blocked by:** none.
- **Files:** `.misc/tickets/ticket.mjs` exports `buildSlug(title)`; run as a script it prints the
  slug of `process.env.TITLE`, and exits 2 naming `TITLE` when it is empty. The `slug` target in
  the `Makefile`; a row in `docs/knowledge/tooling.md › Commands`.
- **Introduces:** `buildSlug` → the script's own run. Removes later: none.
- **Size:** ~25, docs ~5.
- **Test first:** the Seam `make slug` — `make slug TITLE="SDD in stages, again!"` prints
  `sdd-in-stages-again`; before the step, make knows no target `slug`.
- **Verify:**
  - `make slug TITLE="SDD in stages, again!"` prints `sdd-in-stages-again`;
  - `make slug` exits non-zero, its message naming `TITLE`;
  - `make check` passes.
- **Model:** `opus high`
- **Status:** todo

#### S2 — A long slug is cut after a whole word

- **Delivers:** a slug over 30 characters ends after the last whole word that fits.
- **Goal:** R2 inside `buildSlug`, so both targets cut alike (R2).
- **Blocked by:** S1.
- **Files:** `.misc/tickets/ticket.mjs`. Trap: a first word over 30 characters is cut at 30, so the
  slug is never empty.
- **Introduces:** none. Removes later: none.
- **Size:** ~10.
- **Test first:** the Seam `make slug` — `make slug TITLE="Split the attachment storage into three
  modules"` prints `split-the-attachment-storage`; before the step it prints all seven words.
- **Verify:**
  - that command;
  - `make slug TITLE="Supercalifragilisticexpialidocious words"` prints its first 30 letters;
  - `make check` passes.
- **Model:** `opus high`
- **Status:** todo

#### S3 — `make ticket` creates the folder from the template

- **Delivers:** `make ticket TITLE="<title>"` copies the template into
  `docs/tickets/<YYYY-MM-DD-HHmm>_<slug>/`, in local time, and writes the title into the feature's
  heading.
- **Goal:** R4 through `buildSlug`, never a second slug (R4, D1).
- **Blocked by:** S1.
- **Files:** `.misc/tickets/ticket.mjs`, its `ticket` command calling `buildSlug`; the `ticket`
  target; a row in `docs/knowledge/tooling.md › Commands`. Trap: only `feature.md`'s heading takes
  the title; the other files keep `<Title>`.
- **Introduces:** the `ticket` command → the `ticket` target. Removes later: none.
- **Size:** ~35, docs ~5.
- **Test first:** the Seam `make ticket`, in a `git clone --local` — `make ticket TITLE="Sample
  title"` creates `docs/tickets/<now>_sample-title/`; before the step, make knows no target
  `ticket`.
- **Verify:**
  - `ls docs/tickets/*_sample-title/` lists the template's four files;
  - `head -n 1 docs/tickets/*_sample-title/feature.md` prints `# Sample title`;
  - `make check` passes.
- **Model:** `opus high`
- **Status:** todo

### Stage review

## Stage 2 — `make ticket` refuses a taken slug and names the next command

Not prepared: `/ticket-plan <ticket folder> next` prepares it once Stage 1 lands.

## Requirement coverage

| Req | Steps | Completed in |
|---|---|---|
| R1 | S1 | Stage 1 |
| R2 | S2 | Stage 1 |
| R3 | S5 | Stage 2 |
| R4 | S3 | Stage 1 |
| R5 | S4 | Stage 2 |
| R6 | S6 | Stage 2 |
