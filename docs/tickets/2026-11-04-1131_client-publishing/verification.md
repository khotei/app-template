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

## 2026-11-05 — run 3

**Verdict:** pass

Fixed point `da59b81b29`. Same two groups: A (R1, R4, R5, R6, R7, R8 and `make check`, since it plants
probes and starts the api) and B (R2, R3, unit tests only). `make check` is green (247 unit, 104 e2e,
34 s); both verifiers left the tree clean.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | Manifest lists only `effect`. A probe importing every workspace, `@effect/platform-bun`, `drizzle-orm`, `node:fs`, `bun`, a `../application/...` path and `#http-api/../application/...` failed `make lint` with 20 errors, one per import, each naming it; `effect`, `effect/Schema` and `#http-api/shared/ids` passed. `export * from`, `export { … } from` and `import()` forms failed too (3 errors). Run 2's gap (`vitest` from the root `node_modules`) is closed by S8's allow-list. |
| R2 | pass | `chat.handler.test.ts:52-67` reads `Option.none()` and a UTC `DateTime`; `attachment.handler.test.ts:113-158` catches the contract's class by tag; a runtime probe printed `instanceof contract true`, `instanceof domain false`; `bunx tsc -b apps/api` exits 0 with the branded `ChatId` required (brands are proven by types only). |
| R3 | pass | Nine of 13 endpoints return a model and each passes through `buildApi<Model>` (`chat.handler.ts` 24, 33, 41, 48, 65, 78; `attachment.handler.ts` 82, 90; `user.handler.ts` 37); no handler translates a domain error; wire tests assert `title: null`, an ISO date, `cause` absent. Caveat: see Spec finding 2 (the chat and message mappers return a copy, not their argument). |
| R4 | pass | `make api-check` exits 0; `openapi.json` differs only in `UserEncoded` → `User`; the fixed point's own generated document is byte-identical to its snapshot. Not run: one recorded request sequence against both versions (the sandbox refused the probe file); R4 rests on the OpenAPI comparison and the unchanged test assertions. |
| R5 | pass | Drifted title limit, brand, error tag each fail naming the pair; a new `ProbeTwin` on both sides was compared with no edit to the test (22 → 23 tests); the test that encodes a domain error through the contract's class holds. Dropping `'ReplyRefused'` from the domain literal now fails `× MessageFailureReason`. Notes: Spec finding 3 and the order of failure below. |
| R6 | pass | Every side-effects flag removed, then effect's installed one as well: `make bundle-check` exit 0 both times (bundle 0.42 → 0.51 MB, inputs only the web, `effect`, `http-api`, `packages/ui`); the fixed point with its flags removed fails with `AttachmentService`, `ChatService`, `QueueConfig` in `main.js`. |
| R7 | pass | Planted `drizzle-orm`, `@app-template/packages/db`, `@effect/sql-pg` and six `node:*` built-ins each refused with package and shortest chain (`main.ts → health-panel.ts → packages/db/index.ts`); no repository folder name in `bundle-check.mjs`. |
| R8 | pass | `MessageFailure.cause` → `detail` touches only `application/**` and tests; `Attachment.fileName` → `originalName` flags one api file, `attachment.mapper.ts`, and nothing in the contract or the web (it is also read as input, so the handler's input builder follows, as the acceptance row says). The rename probe was reverted; `fileName` stays (user, 2026-11-05). |

**Not verifiable:** none within R2 and R3 (the web's own client code has no test, per the architecture's
Seams). Group A's live-response diff for R4 is noted above.

### Review

#### Review ledger

Summed from each step's **Findings** in `plan.md` (S1–S10), one bullet is one finding.

| Pass | Findings | Accepted | Fixed | Rejected |
|---|---|---|---|---|
| simplify | 3 | 1 | 1 | 2 |
| Standards | 11 | 8 | 7 | 3 |
| Spec | 13 | 10 | 9 | 3 |
| Design | 8 | 4 | 4 | 4 |

One accepted Standards finding (S2, `naming.md` `.mapper` row) was "open for S3" and one accepted Spec
finding (S3, `browserPackages` in `tooling.md`) was "moved to S4"; both count as accepted, not as
fixed. No hunt pass ran in any step; S9's out-of-scope note (the literal reason list a third time in
`kernel/data/chat/message.table.ts:20`) is a question for the kernel ring.

#### Standards

All rules and the touched `CLAUDE.md` files read whole; no hard breaks, one judgement finding.

- `application/CLAUDE.md:11-14` — `claude-md.md` › The owner (only the currently binding constraint,
  no tombstones) — judgement. The clause "Why the bans stay though nothing of the domain reaches the
  browser" narrates the removed browser-shipping rule. Cut it to the link to the record.

#### Spec

Checked and holding: R1–R8 as in the table above; the Biome `importNamePattern` ban is replaced by the
allow-list at `.misc/lint/biome.base.json:73`, the service-key `grep` by `.misc/lint/bundle-check.mjs`,
and the "Browser-safe" line of `http-api/CLAUDE.md` by its "Imports only `effect`" line; roadmap entry
26 is present. Three findings, all judgement:

- `.claude/skills/ticket-implement/SKILL.md:26` and seven more files — nothing in the ticket asks for
  them: the "new-interface step" kind, **Introduces**, the **Shape** check, the "whole step" gate in
  `implementer.md` and `sdd.md:35`, `claude-md.md:51`, `docs/tickets/_template/plan.md`,
  `docs/knowledge/sdd.md:72`, `guard-probes.md`. `feature.md › Scope` does not name them. Fix: one
  line in Scope naming the toolkit's own lessons, or leave them to the PR description.
- `apps/api/chat/chat.mapper.ts:10` — R3 ("returns the value as it is while the shapes match";
  acceptance "returns its argument") — `buildApiChat` and `buildApiMessage` return a copy made by
  `Struct.evolve`, not their argument (D6, which closed run 1's R8). Group B confirmed it at runtime
  (`apiChat === chat` is `false`, every field equal). Fix: reword R3 and its acceptance row to "the
  identity on its own fields; a nested model through its own mapper".
- `apps/api/__tests__/contract-twins.test.ts:17` (group A) — R5 ("no list … kept by hand") —
  `modules = { Chat, Identity }` is still a list kept by hand; a twin in a new module is compared only
  once that module is added. Dropped by the user in run 1, simplification 2; listed again only
  because group A met it.

Order of failure (group A, R5): a title limit drifted on the contract side stops `make check` first at
`api-check` with an OpenAPI diff (`maxLength 120 → 121`) that does not name `ChatTitle`; the twins test
would, but runs later. The pair is named whenever the drift is on the domain side.

### Simplifications

1. `application/CLAUDE.md:11-14` — cut the narrated clause to a link to the record (Standards).
2. `feature.md` R3 and its acceptance row — reword to "the identity on its own fields; a nested model
   through its own mapper", so the text matches D6. Open for the user: a `feature.md` change, not a
   code step.
3. `feature.md › Scope` — name the toolkit's own lessons (the `.claude/` and `docs/tickets/_template`
   edits), or leave it. Open for the user.
4. Kept as is (user, 2026-11-05): `api-check` naming an OpenAPI diff counts as naming the pair for a
   contract-side drift of a limit (R5); the twins test would run after the e2e if moved before it.
5. Kept as is (user, 2026-11-05): the twins test's hand-kept module list; derived from
   `application/package.json › exports` it would need a second list of exceptions (`use-cases`, the
   `testing` entries).

### Lessons

#### L4 — a step changed a behaviour and left a page that describes it, or a file outside its Files

- **Evidence:** Spec findings "`architecture.md` described the old check/ban" in S4 (Contracts), S5
  (Contracts entry, D6 heading, Seams row), S6 (Structure invariant, Guards, Seams row) and S8
  (Guards, Seams row); S4's "`roadmap.md` entry 7 rewritten", S6's "`decisions.md` joined the step's
  Files", S8's "`http-api/CLAUDE.md` joined the step's Files".
- **Cost:** a Spec finding fixed in the same commit in each of four steps, and a Files list wrong in
  three; no wrong result reached a gate.
- **Proposed change:** one line in `.claude/skills/ticket-plan/SKILL.md` (Files item): a step that
  changes a guard, mapper or check lists every `architecture.md`, record and `CLAUDE.md` line that
  names it, found by grep of its name.
- **Applied:** yes (2026-11-05), as a Verify bullet in `.claude/skills/ticket-plan/SKILL.md`; the
  Files list stays "a start, not the bound", so only the grep is asked.

#### L5 — L2 recurred after it was applied

- **Evidence:** S7.2 Standards (the `.http` cell restated the `.id` · `.model` · `.error` row) and
  S10.2 Standards and Spec (the line restated the hunt's trigger and "Standards, Spec" from line 43),
  both after L2's line landed in `claude-md.md`, which the implementer does not necessarily read.
- **Cost:** one fix round each in S7 and S10 (S7.2, S10.2).
- **Proposed change:** one line in `.claude/agents/implementer.md`: an edit of an instruction file or
  rule ends with a grep of each fact the new line states, and a line whose fact another file owns
  becomes a pointer.
- **Applied:** yes (2026-11-05), as the "A fact once" discipline in `.claude/agents/implementer.md`.
