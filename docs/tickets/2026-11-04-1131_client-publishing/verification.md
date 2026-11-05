# Client publishing — verification

> Ticket: `2026-11-04-1131_client-publishing` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-11-05 — run 1

**Verdict:** fail

Fixed point `da59b81b29`. Two verifier groups: A (R1, R4, R5, R6, R7, R8 and `make check`, since it
plants probes and starts the api) and B (R2, R3, unit tests only).

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | Manifest lists only `effect`; planted imports of `@app-template/application/chat`, `kernel`, `packages/ui`, `@effect/vitest` each fail `make lint` (4 `noRestrictedImports`, naming the import); `drizzle-orm` fails `tsc -b` (`TS2307`). Gap: see Spec finding 3 (`node:*`, `bun:*` pass the lint ban). |
| R2 | pass | `chat.handler.test.ts:52-67` reads `Option.none()` and `DateTime`; `attachment.handler.test.ts:148-156` catches the contract's class by tag; a probe decoded the wire JSON to `instanceof contract: true`, `instanceof domain: false`. Brands are proven by types only. |
| R3 | pass | Every model a handler returns passes through `buildApi<Model>` (`chat.handler.ts`, `attachment.handler.ts:82,90`, `user.handler.ts:37`); mappers are identities; wire tests at `chat.handler.test.ts:65,125-141,183`; 41 unit tests green. |
| R4 | pass | `openapi.json` differs only in `UserEncoded` → `User`; `make api-check` green; live api returned the same statuses and shapes; e2e 104/104. |
| R5 | pass | Planted drifts of the title limit, a brand, an error tag and a pattern flag each fail naming the pair; a new `ProbeTwin` on both sides was compared with no edit to the test. Gap: see Spec finding 2 (a new module is not compared). |
| R6 | pass | `sideEffects` removed from `http-api` and from the installed `effect` manifest: `make bundle-check` exit 0; inputs were still only the web, `http-api`, `packages/ui`, `effect`. |
| R7 | pass | Planted `packages/db`, `drizzle-orm`, `@effect/sql-pg`, `kernel/postgres` each refused with package and chain (`main.ts → health-panel.ts → zz-probe.ts → packages/db/index.ts`); no repository folder name in `bundle-check.mjs`. |
| R8 | **fail** | `MessageFailure.cause` rename touches no contract, web, mapper or handler file; `User.createdAt` rename breaks exactly one mapper. `Attachment.fileName` rename breaks `attachment.mapper.ts` and two in `chat.mapper.ts`: three edits in two files, not one (acceptance row: "edits one mapper"). |

**Not verifiable:** none.

### Review

#### Review ledger

Summed from each step's **Findings** in `plan.md`, one bullet is one finding.

| Pass | Findings | Accepted | Fixed | Rejected |
|---|---|---|---|---|
| simplify | 3 | 1 | 1 | 2 |
| Standards | 7 | 5 | 4 | 2 |
| Spec | 4 | 4 | 3 | 0 |
| Design | 7 | 3 | 3 | 4 |

One accepted Standards finding (S2, `naming.md` `.mapper` row) was "open for S3" and one accepted
Spec finding (S3, `browserPackages` in `tooling.md`) was "moved to S4"; both count as accepted, not
as fixed, since the plan does not say they landed. No hunt pass ran in any step.

#### Standards

Rules and `CLAUDE.md` files read whole; no hard breaks. `make doc-lint` printed nothing.

- `http-api/attachment/attachment.http.ts:10` — `naming.md` § Files, `.http` row — judgement. The
  file also declares `FileName`, `MediaType`, `FileSize`, `ApiAttachment` and two errors;
  `chat/chat.http.ts:35` and `:66` do the same with `ApiChat`, `ApiMessage`, status lists and four
  errors. Their names do not match the rule's roles (`.model`, `.error`, `.id`). Either move them
  into `<name>.model.ts` and `<name>.error.ts`, or add a contract-side exception to the `.http`
  row. The reviewer recommends the exception, since the contract keeps the domain's export names.
- `http-api/shared/security.ts:12` — `naming.md` § Files, `.error` suffix — judgement.
  `UserUnknownError` sits in a file named for security. Same fix as above.
- `.claude/agents/reviewer.md:28-34` — `writing-for-agents` § Pruning, single source of truth —
  judgement. The new "step that does not stand alone" clause restates the plan-shape check already
  in `ticket-implement/SKILL.md` and `ticket-plan/SKILL.md` (the **Shape** list). Keep it in the
  reviewer, which owns the finding, and point the skills to it.

#### Spec

- `apps/api/chat/chat.mapper.ts:3` — R8 — a rename of a wire field in the domain `Attachment`
  breaks `buildApiAttachment`, `buildApiChat` and `buildApiMessage`, since the chat and message
  mappers return nested attachments unchanged: three mappers in two files, not one. Fix: pass
  `attachments` through `buildApiAttachment` (`Struct.evolve`) in both. Confirmed by the group A
  verifier.
- `apps/api/__tests__/contract-twins.test.ts:27` — R5 ("no list kept by hand") — `modules = { Chat,
  Identity }` is a list kept by hand: a new module `billing` with an `InvoiceTitle` twin of a
  different limit passes `make check`. Fix: derive the modules from `application/package.json ›
  exports`, or state in R5 and `http-api/CLAUDE.md` that a new module is added to this line.
- `.misc/lint/biome.base.json:72` — R1 — `import { readFileSync } from 'node:fs'` and
  `import { Database } from 'bun:sqlite'` in `http-api/` pass the contract's lint ban (shown: `bunx
  biome lint http-api/planted.ts` → "No fixes applied"; the typecheck half was not run). Fix: add
  `node:*` and `bun` / `bun:*` to the `http-api/**` group and narrow `types` in
  `http-api/tsconfig.json`.

Checked and holding: R2, R3, R4, R6, R7; both deleted guards are replaced (`importNamePattern` by the
no-workspace ban, the grep by `.misc/lint/bundle-check.mjs`); roadmap entries 10 and 26 and the record
"The API contract on its own" are present.

### Simplifications

1. `apps/api/chat/chat.mapper.ts:4,6` — route `attachments` through `buildApiAttachment` in
   `buildApiChat` and `buildApiMessage` (`Struct.evolve`); a nested-field rename then edits one
   mapper, which closes R8.
2. `apps/api/__tests__/contract-twins.test.ts:27` — derive the module list from
   `application/package.json › exports` (R5). Dropped by the user, 2026-11-05: the mappers' types
   already fail a drifted brand or error tag of a new module; a drifted constraint (length,
   pattern) of a new module stays unchecked until its twin is added to the list.
3. `.misc/lint/biome.base.json:72` and `http-api/tsconfig.json` — ban `node:*` and `bun:*` imports in
   the contract and narrow its `types` (R1).
4. `.claude/rules/naming.md` — one contract-side exception on the `.http` row (the contract keeps the
   domain's export names), in place of splitting `.model` and `.error` files.
5. `.claude/skills/ticket-implement/SKILL.md`, `ticket-plan/SKILL.md` — point to `reviewer.md` for
   the "step that does not stand alone" check instead of restating it.

### Lessons

#### L1 — a "one edit" claim was written before it was probed on a nested case

- **Evidence:** S2 findings: the R5 and R8 plants "fail in more files than the plan named (the
  handlers…; `chat.mapper.ts`, which nests attachments); Verify reworded", and the R4 line of
  `feature.md › Acceptance` was reworded to fit; verification then found the R8 row still says "one
  mapper" while an attachment rename breaks three. The Spec reviewer and the group A verifier both
  report it.
- **Cost:** a failed requirement at the last gate after S2 had already met the same nesting.
- **Proposed change:** one line in `.claude/skills/ticket-plan/SKILL.md` (Verify items): a
  "renaming X edits N files" item names the deepest nesting of X (a field inside a model another
  model embeds) and plants the rename there.
- **Applied:** yes (2026-11-05)

#### L2 — a doc line restated a fact another file owns, or listed what the folder holds

- **Evidence:** S1 Standards (`http-api/CLAUDE.md` "still the domain's" would go stale; the ids
  bullet listed what the folder holds), S3 Standards (`effect-schema.md` restated
  `OptionFromNullOr`, owned by `http-api/CLAUDE.md`), S3 Design (step 6 of "Add a new entity"
  restated the contract's rules), and this run's Standards finding on `reviewer.md` against the two
  skills.
- **Cost:** a fix round in S1 (S1.2) and S3 (S3.2), and one more open now.
- **Proposed change:** one line in `.claude/rules/claude-md.md`: before a rule or `CLAUDE.md` line
  states a fact, grep for it; if another file owns it, link to that file.
- **Applied:** yes (2026-11-05)

## 2026-11-05 — run 2

**Verdict:** fail

Fixed point `da59b81b29`. Same two groups as run 1: A (R1, R4, R5, R6, R7, R8 and `make check`, since
it plants probes and starts the api) and B (R2, R3, unit tests only). `make check` is green on both
sides of A's probes (246 unit, 104 e2e); A left the tree clean.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | **fail** | Manifest lists only `effect`; planted workspace imports, `@effect/vitest`, `node:fs` and a relative path each fail `make lint` with the import quoted (11 errors); an undeclared `drizzle-orm` fails `tsc -b` (`TS2307`). Gap: `export { describe as probe } from 'vitest'` appended to `http-api/shared/limits.ts` passed `doc-lint sh-lint lint typecheck api-check migration-check test-unit bundle-check` (exit 0), because `vitest` resolves from the root `node_modules`; so would `drizzle-kit`, `typescript`, `husky`, `markdownlint-cli2`. The ban is a deny-list of four families, not "no package but Effect". |
| R2 | pass | `chat.handler.test.ts` reads `Option.none()` and `DateTime.isUtc`; the attachment test catches the contract's error by tag; a type probe (`tsc` exit 0) shows branded `ChatId`, `Option<ChatTitle>`, `Utc`, and two `@ts-expect-error` held; a decode probe gave `instanceof` the contract's class `true`. |
| R3 | pass | Every model-returning endpoint passes through `buildApi<Model>` (`chat.handler.ts` 24, 33, 41, 48, 65, 78; `attachment.handler.ts` 82, 90; `user.handler.ts` 37); no `mapError` in the chat handler; wire tests assert `title: null`, ISO date, `cause` absent. |
| R4 | pass | `make api-check` green; `openapi.json` differs only in `UserEncoded` → `User`. |
| R5 | pass | Drifted title limit, brand, error tag and a dropped `i` flag each fail naming the pair; a new `ProbeTwin` on both sides was compared with no edit to the test (21 → 22). Gaps: see Spec findings 1 and 2. |
| R6 | pass | `sideEffects` removed from `http-api` and from the installed `effect` manifest: `make bundle-check` exit 0 both times. |
| R7 | pass | Planted `packages/db`, `drizzle-orm`, `@effect/sql-pg` refused with package and chain (`main.ts → health-panel.ts → packages/db/index.ts → …`); no repository folder name in `bundle-check.mjs`. |
| R8 | pass | `MessageFailure.cause` → `detail`: errors only in `application/**` and tests; `Attachment.size` → `byteSize`: one api file (`attachment.mapper.ts`), no contract, web or handler file, e2e 104/104. Caveat: `Attachment.fileName` also feeds `AttachmentUpload = Pick<Attachment, 'mediaType' | 'fileName'>` (`attachment.service.ts:34`), built in `attachment.handler.ts` (`decodeUpload`), so that rename edits a handler; the acceptance row ("no … handler file") holds for fields the api only returns. |

**Not verifiable:** none.

### Review

#### Review ledger

Summed from each step's **Findings** in `plan.md` (S1–S7), one bullet is one finding.

| Pass | Findings | Accepted | Fixed | Rejected |
|---|---|---|---|---|
| simplify | 3 | 1 | 1 | 2 |
| Standards | 9 | 6 | 5 | 3 |
| Spec | 9 | 7 | 6 | 2 |
| Design | 7 | 3 | 3 | 4 |

One accepted Standards finding (S2, `naming.md` `.mapper` row) was "open for S3" and one accepted
Spec finding (S3, `browserPackages` in `tooling.md`) was "moved to S4"; both count as accepted, not
as fixed. No hunt pass ran in any step.

#### Standards

Rules and `CLAUDE.md` files read whole; no hard breaks, three judgement findings.

- `http-api/shared/ids.ts:1` — `naming.md` › Files (singular name, role suffix) — judgement. Plural
  `ids.ts` has no role; rename to `id.ts`. Already rejected in S1 (`errors.ts` and `limits.ts` set
  the precedent in this folder), so it stands rejected unless the user says otherwise.
- `.claude/agents/implementer.md:22` — `claude-md.md` › The owner (one author per fact) —
  judgement. The line restates the "step that does not stand alone" test (a name only a later step
  uses, code a later step removes, a shared page) that `.claude/agents/reviewer.md:31` owns and
  `ticket-plan/SKILL.md` already points to. Replace it with a pointer.
- `.claude/skills/ticket-implement/SKILL.md:26` — `writing-for-agents` › completion criteria —
  judgement. "Any other step gets Standards and Spec" sits beside the hunt rule at line 59 and "Any
  other step runs no hunt" at line 61: a behaviour step that touches access or error handling reads
  two ways. Say "a behaviour step that is not new-interface gets Standards, Spec and, per line 59,
  the hunt".

#### Spec

Checked and holding: R1 (workspace, `@effect/**`, `node:*`, `bun*` bans; `types: []`), R2–R4, R6,
R7; the two deleted guards are replaced; the record "The API contract on its own", roadmap entries
10 and 26, `application/CLAUDE.md` and the `http-api` README are in the diff. Two findings, both R5:

- `apps/api/__tests__/contract-twins.test.ts:17` — `modules = { Chat, Identity }` is a list kept by
  hand: a third module `application/billing` exporting `InvoiceId` beside a contract `InvoiceId`
  with a different check is compared by nothing, and `make check` passes. Fix: build the list from
  `application/package.json › exports`, or fail the test when an export is missing from `modules`.
  (Dropped by the user in run 1, simplification 2.)
- `http-api/chat/chat.http.ts` (about line 54) — `ApiMessageFailure.reason` restates
  `Schema.Literals(['ReplyFailed', 'ReplyRefused'])` from `application/chat/domain/message.model.ts:30`
  with no schema of that name on both sides, so the twins test never pairs them. If the domain drops
  `'ReplyRefused'`, the narrower domain type still fits the contract's in `buildApiMessage`, so
  `tsc` and `make check` stay green while the contract and `openapi.json` promise a reason the
  server no longer sends. Fix: export the literal as a named schema on both sides
  (`MessageFailureReason`).

### Simplifications

1. `biome.base.json:72` (the `http-api/**` override) — turn the deny-list into an allow-list: refuse
   every import except `effect`, `effect/*`, and relative paths inside `http-api/` (check that
   Biome's `noRestrictedImports` negated patterns express this; if not, a small import check in the
   style of `bundle-check.mjs` over the contract's files). Closes R1.
2. `http-api/chat/chat.http.ts` and `application/chat/domain/message.model.ts` — export the failure
   reason as `MessageFailureReason` on both sides so the twins test pairs it (R5).
3. `.claude/agents/implementer.md:22` — pointer to `reviewer.md` in place of the restated test.
4. `.claude/skills/ticket-implement/SKILL.md:26` — say when the hunt still runs on a behaviour step.
5. Open for the user (a `feature.md` change, not a code step): reword the R8 acceptance row to "a
   rename of a domain field that is on the wire edits one mapper and no contract or web file; a
   field the api also reads from input edits the handler's input builder too", or keep the row and
   accept the caveat above. The twins test's hand-kept module list (Spec finding 1) stays dropped
   per run 1, unless the user reopens it.

### Lessons

#### L3 — a guard was closed by its planted cases, not by the class it bans

- **Evidence:** S6 Spec finding rejected a bare `'fs'` import because `tsc` would catch it
  (reasoned per case, not per class); run 1 found `node:*` and `bun:*` passing the lint ban (fixed
  in S6); run 2 finds a root-installed third-party package passing every gate (R1), and an
  unpaired literal beside the twins test (R5). Two verification runs in a row failed a guard at the
  edge of its list.
- **Cost:** R1 failed at the last gate in run 2 after S6 had closed run 1's gap; one more fix step
  and a second `/ticket-verify`.
- **Proposed change:** one line in `.claude/skills/ticket-plan/guard-probes.md`: a step that
  adds a ban or a guard states whether it is an allow-list or a deny-list, prefers the allow-list
  when the requirement says "only X", and plants one member of each class the requirement names
  (a workspace, a built-in, an installed third-party package).
- **Applied:** yes (2026-11-05), in `.claude/skills/ticket-plan/guard-probes.md`, which owns the guard probes, not in `SKILL.md`.
