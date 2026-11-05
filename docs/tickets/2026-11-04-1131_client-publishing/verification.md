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
   `application/package.json › exports`; a new module is then compared with no edit (R5).
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
- **Applied:** no

#### L2 — a doc line restated a fact another file owns, or listed what the folder holds

- **Evidence:** S1 Standards (`http-api/CLAUDE.md` "still the domain's" would go stale; the ids
  bullet listed what the folder holds), S3 Standards (`effect-schema.md` restated
  `OptionFromNullOr`, owned by `http-api/CLAUDE.md`), S3 Design (step 6 of "Add a new entity"
  restated the contract's rules), and this run's Standards finding on `reviewer.md` against the two
  skills.
- **Cost:** a fix round in S1 (S1.2) and S3 (S3.2), and one more open now.
- **Proposed change:** one line in `.claude/rules/claude-md.md`: before a rule or `CLAUDE.md` line
  states a fact, grep for it; if another file owns it, link to that file.
- **Applied:** no
