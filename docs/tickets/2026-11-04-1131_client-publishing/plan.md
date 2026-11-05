# Client publishing — plan

> Ticket: `2026-11-04-1131_client-publishing` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | the ids, `Auth`, `CurrentUser` and `UserUnknownError` declared by the contract; identity's contract keeps `UserId` | done |
| S2 | the contract on its own schemas: the user, attachment and chat groups, their mappers, the manifest declaring only `effect` | done |
| S3 | the twins test over every twin, and the knowledge docs and records of the new boundary, each page written once | todo |
| S4 | the guards: the contract's Biome override bans every workspace; `make bundle-check` reads the metafile against `browserPackages` | todo |

## How to run this plan

- Branch `chore/client-publishing`; commits by round, under the commit gate of
  `.claude/rules/sdd.md › Gates` (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.
- The steps run in order. Each delivers a whole thing: a step never leaves a name, a file or a page
  that a later step rewrites, so a step's Verify reads only what it delivers.
- The prototype branch `proto/client-publishing-contract` (worktree
  `client-publishing-contract-proto`) is a reference, never a source to cherry-pick (feature.md ›
  Q2): the sketches in `architecture.md › Contracts` are the contract's shape.

## Steps

#### S1 — The auth middleware and the ids in the contract

- **Delivers:** `http-api` declares the four ids, `CurrentUser`, `Auth` and `UserUnknownError`
  itself, and the api implements that `Auth` over identity's `UserService`. Identity's contract
  keeps only `UserId`; `UserUnknownError` moves to its domain. The wire does not change.
- **Goal:** the one HTTP concept the contract took from a module is the contract's, so no module
  declares an HTTP middleware and the contract's last import of identity is the user model (D4;
  R1 in part, R4 kept).
- **Blocked by:** none.
- **Files:**
  - `http-api/shared/ids.ts` (new): `UserId`, `ChatId`, `MessageId`, `AttachmentId`, each
    `Schema.String.check(Schema.isUUID()).pipe(Schema.brand('<Model>Id'))` with the domain's
    brand name; re-exported by `http-api/index.ts`. Bare-named like `errors.ts` and `limits.ts`
    beside it: `shared/` holds the contract's cross-group files, not one model's.
  - `http-api/shared/security.ts`: `UserUnknownError` (`Schema.TaggedError`, no fields,
    `{ httpApiStatus: 401 }`), `CurrentUser` (`Context.Service<CurrentUser, { readonly id: UserId }>`,
    key `@app-template/http-api/shared/CurrentUser`), `Auth`
    (`HttpApiMiddleware.Service<Auth, { provides: CurrentUser }>`, key
    `@app-template/http-api/shared/Auth`, `security.cookie` as today, `error: UserUnknownError`
    bare, since the status sits on the class). `chat.http.ts` and `attachment.http.ts` take `Auth`
    from `#http-api/shared/security`.
  - `application/identity/contract/auth.ts` removed; `contract/user.error.ts` moved to
    `domain/user.error.ts` (`git mv`) and re-exported by `domain/index.ts`; `contract/index.ts`
    re-exports `user.id` alone. The service and its test import the error from its new path.
  - `apps/api/shared/security.ts`: `AuthUserService` provides the contract's `CurrentUser` with the
    `User` that `authenticate` answers, as it is. `chat.handler.ts`, `attachment.handler.ts`,
    `user.handler.ts` and `chat.handler.test.ts` take `CurrentUser`, `Auth` and `UserUnknownError`
    from `@app-template/http-api`.
  - `http-api/CLAUDE.md`: the two bullets this step makes false change now, within the file's
    pattern style (S3 rewrites the file): "Reuse the domain" becomes "the ids, the auth middleware
    and HTTP's own errors are the contract's; a model's shape and a module's errors still come
    from the module's entry", and "Statuses are set here" says a status sits on the contract's
    error class as `httpApiStatus`, or on `.pipe(HttpApiSchema.status(…))` where the class is
    still the domain's.
  - Trap: `UserUnknownError` is the first twin S3 compares, so it keeps the domain's tag and its
    empty field list; its only contract-side addition is `httpApiStatus`.
  - Leftovers: `grep -rnE "contract/auth|contract/user\.error|HttpApiMiddleware|HttpApiSecurity" application/ apps/ http-api/ --include='*.ts'`.
- **Size:** ~105.
- **Test first:** `config only`: a move. The seams that hold the wire stay green: the handler
  tests on `ApiClient` over `ApiServerTest` and `make api-check`.
- **Verify:**
  - `make check` — fails on a type error in a handler (a `CurrentUser` of another key), on a
    changed OpenAPI document, or on a lint ban.
  - `git diff --exit-code HEAD~1 -- http-api/openapi.json` after the commit — fails when the move
    changed the document (D4 claims it does not).
  - `grep -rnE "HttpApiMiddleware|HttpApiSecurity" application/` — prints nothing; fails on a
    module that still declares HTTP middleware.
  - `grep -rn "contract/auth" --include='*.ts' .` — prints nothing; fails on a leftover import.
  - `grep -rn "application/identity" http-api/` — prints only `http-api/user/user.http.ts` (the
    user model, which S2 replaces); fails on `Auth` still imported from identity.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes: simplify (4 angles), Standards, Spec, Design; no hunt (no write guard, fake or retry).
  - Deviation — the four ids are built through a private `buildIdSchema` in `ids.ts`, as the domain's
    helper does (`deep-modules.md`: one function over the varying part); the schemas are the plan's.
  - Deviation — `decisions.md › Module contracts` Cost lost its "`Auth` lives outside `http-api`"
    clause (made false by this step; D4 says the record loses it); the user-DTO clause stays until S2.
  - `make api-check` and `make api-snapshot` leave `openapi.json` byte-identical; `make check` green
    (221 unit, 104 e2e).
  - simplify — rejected: `buildIdSchema(brand: B)` does not compile (`B & EnsureSingleBrandKey<B>`),
    tried and reverted.
  - Standards — accepted, fixed in S1.2: `http-api/CLAUDE.md` "still the domain's" would go stale.
  - Standards — accepted, fixed in S1.2: the ids bullet listed what the folder holds.
  - Spec — accepted, fixed in S1.2: the same bullet called the ids the contract's while the groups
    still import the domain's until S2.
  - Standards — rejected: `ids.ts` plural, no `.id` suffix — `errors.ts` and `limits.ts` set the
    precedent in this folder.
  - Design — rejected: translate identity's `UserUnknownError` at the seam — D4 provides the `User`
    as it is; S3's twins test guards the shape.
  - Design — rejected: `UserUnknownError` into `errors.ts` — the plan keeps it with `Auth`.
  - User — `http-api/shared` keeps its name (asked 2026-11-05).

#### S2 — The contract on its own schemas

- **Delivers:** the user, attachment and chat groups declare their wire shapes (`ApiUser`,
  `ApiAttachment`, `ApiChat`, `ApiMessageFailure`, `ApiMessage`), the constrained strings and
  literals (`FileName`, `MediaType`, `FileSize`, `ChatTitle`, `ChatStatus`, `MessageStatus`,
  `MessageAuthor`) and the six errors of the two groups themselves. The contract's manifest declares
  only `effect` and its `tsconfig.json` references no project. The api answers every model through
  `buildApiUser`, `buildApiAttachment`, `buildApiChat` and `buildApiMessage`, the identity while
  the shapes match, and fails with the domain's errors untouched. The OpenAPI snapshot's user
  component is named `User`; nothing else moves.
- **Goal:** a client reads a chat or an attachment back with every type intact and catches a refusal
  by its tag as the contract's class (R2); the api hands each model to the contract through one
  mapper and the wire shows `null` and ISO dates (R3); the snapshot moves by one component's name
  only (R4, D2); the contract imports nothing of the app, by its manifest and `tsc` (R1; S4 adds
  the lint); a wire field renamed in the domain breaks one mapper, no handler (R8, D6). The
  contract is whole in this step, so no group is left half on the domain's schemas and no name of
  it collides with the domain's (D1).
- **Blocked by:** S1.
- **Files:**
  - `http-api/user/user.http.ts`: `ApiUser = Schema.Struct({ id: UserId, createdAt: Schema.DateTimeUtc })`
    annotated `identifier: 'User'`; `ensure`'s success is `ApiUser` with status 201.
  - `http-api/attachment/attachment.http.ts`: `FileName`, `MediaType` (the domain's pattern with
    its `i` flag), `FileSize`, `ApiAttachment` (`messageId` and `chatId` as
    `Schema.OptionFromNullOr`), `AttachmentNotFoundError` (`{ ids: Schema.NonEmptyArray(AttachmentId) }`,
    `httpApiStatus: 404`), `AttachmentBoundError` (`{ id: AttachmentId }`, `httpApiStatus: 409`);
    `AttachmentMediaType` decodes to the contract's `MediaType`; the endpoints list the classes
    bare, the status being on the class.
  - `http-api/chat/chat.http.ts`: the sketches of `architecture.md › Contracts`; `ApiMessageFailure`
    is `Schema.Struct({ reason: Schema.Literals(['ReplyFailed', 'ReplyRefused']), message: Schema.String })`,
    so `cause` never reaches the wire; `ChatNotFoundError` 404, `ChatBusyError` 409,
    `MessageNotFoundError` 404, `MessageInputInvalidError` 400, the status on the class and the
    endpoints listing the classes bare; the ids from `#http-api/shared/ids`; `ApiAttachment` and
    the two attachment errors from `#http-api/attachment/attachment.http`. Each model is named
    `Api<Model>` at its first appearance, so no export shares a name with the domain's model.
  - `http-api/shared/limits.ts`: `chat.maxTitleLength` is the contract's own `120`.
  - `http-api/index.ts` drops the re-export from `@app-template/application/chat`;
    `http-api/package.json` `dependencies` hold `effect` alone; `http-api/tsconfig.json` has no
    `references`. `apps/web/tsconfig.json` and `apps/api/tsconfig.json` are unchanged.
  - `apps/api/user/user.mapper.ts` (new): `buildApiUser = (user: User): ApiUser => user`;
    `apps/api/attachment/attachment.mapper.ts` (new):
    `buildApiAttachment = (attachment: Attachment): ApiAttachment => attachment`;
    `apps/api/chat/chat.mapper.ts` (new): `buildApiChat = (chat: Chat): ApiChat => chat`,
    `buildApiMessage = (message: Message): ApiMessage => message`. The handlers return through
    them: `ensure` returns `buildApiUser(user)`; `upload` maps with `Arr.map(buildApiAttachment)`; `get`
    returns `buildApiAttachment(…)`;
    `create`, `get`, `rename` return `buildApiChat(…)`, `list` maps with `Arr.map(buildApiChat)`,
    `send` returns both messages through `buildApiMessage`, `getMessage` returns
    `buildApiMessage(…)`.
  - `http-api/openapi.json`: `make api-snapshot`; the diff is `UserEncoded` → `User` on two lines
    and nothing else, recorded in the step report. `feature.md › Acceptance` R4 reads "`make
    api-check` passes; the snapshot differs from today's only in a component's name".
  - `apps/api/__tests__/attachment/attachment.handler.test.ts` and
    `apps/api/__tests__/chat/chat.handler.test.ts`: on `ApiClient`, an uploaded attachment reads
    back with `messageId` `Option.none()`, `createdAt` a `DateTime.Utc` and `id` the branded id; a
    created chat with `title` `Option.none()`, `createdAt` a `DateTime.Utc` and `id` the branded
    id; `get` of an unknown attachment is caught with `Effect.catchTag('AttachmentNotFoundError', …)`
    as the contract's class; on the raw `HttpClient`, `null` and an ISO date; the existing case
    keeps `error.cause` off the wire. The errors come from `@app-template/http-api`, in
    `apps/e2e/api/chat.e2e.ts` too.
  - Docs wait for S3 on purpose: the ticket is one branch and one squash-merged PR, so no commit
    between S2 and S3 reaches `main`, and each page is written once, with the whole contract in
    view. `make doc-lint` stays green meanwhile (the pages name paths that exist).
  - Leftovers: `grep -rn "@app-template/application" http-api/`; `grep -rn "AttachmentNotFoundError" apps/e2e/`.
- **Introduces:** `ApiUser`, `ApiAttachment`, `ApiChat`, `ApiMessage`, `ApiMessageFailure`, the
  strings, literals and six errors → the endpoints that list them, the mappers and the handler
  tests of this step; `buildApiUser`, `buildApiAttachment`, `buildApiChat`, `buildApiMessage` →
  the handlers of this step. Removes later: none.
- **Size:** ~390 by the prototype's measure (the contract ~230, the api ~45, the tests ~110, the
  e2e and snapshot ~10); a step that runs over 400 stops with `BLOCKED:` and the plan is recut
  before more code is written.
- **Test first:** Seam `ApiClient` over `ApiServerTest` (the two handler tests) — the cases that
  catch an error by tag as the contract's class are red until the contract exports it (TS2305 on the
  import); the raw-wire assertions (`null`, an ISO date) are green before and after and hold R4
  through the change.
- **Verify:**
  - `make check` — green; fails on a handler whose return no longer matches the contract, on the
    snapshot, or on a lint ban.
  - `git diff HEAD~1 -- http-api/openapi.json` — two changed lines, `UserEncoded` → `User`; fails
    on any other line.
  - `grep -rn "@app-template/application" http-api/ --include='*.ts' --include='*.json'` and
    `grep -n "application" http-api/tsconfig.json` — both print nothing; fail on a leftover
    import, dependency or project reference.
  - Planted (R5, by `tsc`): `Schema.brand('ChatID')` on the contract's `ChatId` → `make typecheck`
    fails in `apps/api/chat/chat.mapper.ts` and in the handlers that pass the param's id to a service;
    reverted after.
  - Planted (R8): the domain's `Attachment.fileName` renamed to `name` → `make typecheck` names
    `apps/api/attachment/attachment.mapper.ts` (and `chat.mapper.ts`, which nests attachments) and no file under `http-api/`, `apps/web/` or
    `apps/api/*/*.handler.ts`; the domain's `MessageFailure.cause` renamed to `detail` → no file
    under `http-api/` or `apps/web/`; each reverted after.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes: simplify (4 angles), Standards, Spec, Design; no hunt (no retry, fallback or fake).
  Size 363 changed lines of code and tests (268+/95-, 19 files); `make check` green (224 unit,
  104 e2e); `openapi.json` moved on two lines, `UserEncoded` → `User`.
  - Deviation — `AttachmentHandler.get` returns through `buildApiAttachment` too (D6: every
    response model); the Files bullet now says so.
  - Deviation — `feature.md › Acceptance` R4 reworded as the step's Files ask; `bun.lock` lost
    `http-api`'s `@app-template/application` dependency with the manifest change.
  - Deviation — the R5 and R8 plants fail in more files than the plan named (the handlers that
    pass a param's id to a service; `chat.mapper.ts`, which nests attachments); Verify reworded.
  - Standards — accepted, fixed in S2.2: `yield*` nested in a `buildApi<Model>` call at four
    sites (`effect-style.md`: one `yield*` per statement, its value named).
  - Standards — accepted, open for S3: `naming.md` `.mapper` row names `<Model>FromEntity` only
    (S3's docs add `buildApi<Model>`).
  - simplify — accepted, fixed in S2.1: two assertions that repeat decoding (`Schema.is` on a
    decoded id, `instanceOf` after `assertSchemaEquals`).
  - simplify — rejected: dropping the mapper from list handlers (D6, R3); inlining `rename` and
    `getMessage` (the style rule); a `buildApiSendResult` (the result is not a model, the plan
    routes both messages through `buildApiMessage`); a `getWireJson` test helper (three sites).
  - Design — rejected: decoding an upload with the contract's `FileName` and `MediaType` (the
    domain validates its own input; S3's twins test keeps the two equal); one call form for every
    mapper (the style rule fixes it).
  - Spec — none.
  - Design — accepted late, fixed in S2.3: the mapper rides as `Effect.fn`'s extra argument in
    all eight handler sites (like `transaction.run`), so every return path passes it and the body
    holds domain steps only; the user raised it. Main session error: it first rejected the
    candidate as a style-rule break, but `effect-style.md` hands a one-step transformation to a
    combinator.
  - Process — the implementer's S2.1 report lacked the **Scope** block the new rule asks for; it
    came with S2.2.

#### S3 — The twins test and the boundary's documents

- **Delivers:** a unit test in the api pairs every export that the contract and the modules both
  declare under one name and fails when their checks differ: a limit, a pattern and its flags, a
  UUID version, a literal, a class's identifier or fields. One case proves a domain error instance
  encodes through the contract's class. A new twin on both sides joins the test with no edit. The
  knowledge docs, the records and the instruction files describe the new boundary, each page
  written once.
- **Goal:** a drift between the contract and the domain fails `make check` naming the pair, with no
  list of pairs or boundary values kept by hand (R5, D3); the risk "a contract-only annotation
  leaks into the representation" is settled here, in one place; the record of the boundary exists
  (D1, D2, D6).
- **Blocked by:** S2.
- **Files:**
  - `apps/api/__tests__/contract-twins.test.ts` (new): `import * as Contract from
    '@app-template/http-api'`, `import * as Chat from '@app-template/application/chat'`,
    `import * as Identity from '@app-template/application/identity'`; the pairs are the names
    both `Contract` and `{ ...Chat, ...Identity }` export whose values are schemas
    (`Schema.isSchema`); `it.effect.each(pairs)('$name: the contract declares the domain's
    checks', …)` asserts `Schema.toRepresentation` of both sides `deepStrictEqual`; the suite
    fails when no pair is found, so a wrong namespace import cannot pass vacuously. The
    hand-written case:
    `Schema.encodeUnknownEffect(Schema.toCodecJson(Contract.UserUnknownError))(new Identity.UserUnknownError())`
    yields `{ _tag: 'UserUnknownError' }`, so an Effect upgrade that drops the class marker fails
    here first.
  - What the representation holds, checked at plan time on `effect@4.0.6`: a check's payload
    (`isMaxLength` 120 vs 121 differ), a pattern's `source` and `flags` (`i` vs none differ), a
    class's `~identifier` and its tag literal (`XError` vs `YError` differ); it holds no brand
    (`brand('A')` and `brand('B')` are equal, by design: a renamed brand is `tsc`'s through the
    mappers of S2) and no annotation such as `httpApiStatus` (a `TaggedError` with and without it
    are equal), so no strip is needed. If a later Effect adds annotations to it, the error pairs
    fail and the step that upgrades Effect decides.
  - Docs, one pass: `http-api/CLAUDE.md` rewritten within 40 lines (imports only `effect`; a twin
    keeps the domain's export name, so the twins test finds it; `Api<Model>` is a `Schema.Struct`;
    a status sits on the error class; a wire change moves the snapshot); `application/CLAUDE.md`'s
    browser bullet becomes the domain's import bans with their record, no browser reason (S4 drops
    its `"sideEffects"` mention); `docs/knowledge/architecture.md`: *The three rings* (the domain
    no longer ships to the browser; `http-api` is the API contract that imports only `effect`),
    *Dependency rules* (the `http-api` row all ✗; the bullet on what imports only `effect`),
    *Where things live* (`ApiChat`, the contract's twins), *Add a new entity* step 6 (the contract
    declares the entity's wire shape, twins and errors; the api's `buildApi<Model>`);
    `docs/knowledge/tooling.md`'s "A new workspace the browser imports" line;
    `.claude/rules/effect-schema.md`'s "`null` exists only in a wire DTO" names the API contract;
    `.claude/rules/naming.md` `.mapper` row adds the api's `buildApi<Model>`;
    `.claude/rules/layering.md › Handlers`: a handler returns a model through its
    `buildApi<Model>` and fails with domain errors as they are, and the ban "imports no
    repository, mapper or data layer" names the module's `<Model>FromEntity` as the mapper it
    means; `layering.md › Use cases` "Return the contract's shape, a model as is: its DTO's
    encoder drops the fields it leaves out" becomes "Return a model as is: the api's
    `buildApi<Model>` and the contract's struct shape the wire";
    `docs/knowledge/decisions.md`: the record *The API contract on its own* with the page's seven
    fields (D1's Why, Rejected, Cost; Guarded by: the `http-api/**` override, the twins test, the
    mappers under `tsc`, `make bundle-check`; If reversed; Revisit when: a second consumer of the
    contract or a generated client), *A module's layers* rewritten (the domain no longer ships to
    the browser; its bans stay for roadmap entry 26), *Module contracts* Cost without the user DTO
    line.
  - Leftovers: `grep -rn "ships to the browser" docs/ .claude/ application/ http-api/ packages/`.
- **Introduces:** `contract-twins.test.ts` → `make test-unit` in this step; the pages listed
  above, each written once. Removes later: none.
- **Size:** ~260: the test ~110, the docs and records ~150.
- **Test first:** Seam `apps/api/__tests__/contract-twins.test.ts` — with `Schema.isUUID()`
  dropped from the contract's `UserId` in `http-api/shared/ids.ts`, the test fails naming `UserId`;
  with the check back, it passes. The docs part is `config only`.
- **Verify:**
  - `make test-unit` — the suite's titles name `UserId`, `ChatId`, `MessageId`, `AttachmentId`,
    `UserUnknownError`, `ChatTitle`, `ChatStatus`, `MessageStatus`, `MessageAuthor`, `FileName`,
    `MediaType`, `FileSize` and the six errors of the two groups; fails on fewer pairs (a namespace
    import that misses an entry). `grep -n "ChatTitle" http-api/index.ts` prints nothing: the
    contract's `ChatTitle` is its own, not a re-export that would compare with itself.
  - Planted: `http-api/shared/ids.ts` without `Schema.isUUID()` on `UserId` → `make test-unit`
    fails naming `UserId`; the contract's `UserUnknownError` with identifier `'UserUnknown'` → the
    twins case and the hand-written case both fail; the contract's `MediaType` pattern without its
    `i` flag → fails naming `MediaType`; `limits.chat.maxTitleLength` 121 → fails naming
    `ChatTitle`; the contract's `ChatNotFoundError` identifier `'ChatNotFound'` → fails naming
    `ChatNotFoundError`; each reverted after.
  - `make doc-lint` — fails on `http-api/CLAUDE.md` over 40 lines or a broken path.
  - `make check` — green.
- **Model:** `opus high`
- **Status:** todo
- **Findings:**

#### S4 — The guards: the contract's override and the bundle check over the metafile

- **Delivers:** Biome refuses any workspace or `@effect/*` import in the contract, naming the
  record; the contract and domain overrides' messages lose their browser reason.
  `make bundle-check` builds the web bundle with a metafile and refuses any package outside
  `browserPackages` in `apps/web/package.json`, naming the package and the import chain, with no
  repository folder name in the check. `application/package.json` loses `"sideEffects": false`.
- **Goal:** an import of the app in the contract fails `make check` naming it (R1); the web bundle
  holds no server code whether or not a side-effects flag holds (R6); a package outside the list
  fails the check with its chain (R7); D5.
- **Blocked by:** S3.
- **Files:**
  - `.misc/lint/biome.base.json`: the `http-api/**` override keeps one pattern,
    `["@app-template/**", "@effect/**"]`, message "the API contract imports only effect: no
    workspace and no @effect/* package (decisions.md › The API contract on its own; Guards are
    configuration)"; the `application/*/contract/**` message drops "the browser too"; the
    `application/*/domain/**` message drops "and ships to the browser". The `apps/web/**` override
    stays.
  - `.misc/lint/bundle-check.mjs` (new): `bun .misc/lint/bundle-check.mjs <metafile>`. Reads
    `inputs` and `outputs`; the entry is the one `outputs[*].entryPoint`. An input under a
    `node_modules/` segment belongs to the package named by its last `node_modules/<name>` or
    `node_modules/@<scope>/<name>`; any other input belongs to the nearest `package.json` up its
    path, by that manifest's `name`, plus the subpath of the `exports` entry whose target folder
    holds the file when the manifest exports more than `.` (`@app-template/application/chat`,
    `@app-template/packages/ui`, `@app-template/kernel/data`); the entry's own package is
    implied. The dependency paths carry a version and a hash
    (`node_modules/.bun/@effect+sql-pg@4.0.6+2d96…/node_modules/@effect/sql-pg/…`), which the
    last-segment rule skips. Bun's metafile lists only the inputs the bundle keeps: today 143,
    the one dependency `effect`. The allowed list is
    `browserPackages` of the entry's manifest. A refusal prints
    `bundle-check: <package> is not in <manifest path> › browserPackages` and the shortest chain
    from the entry (a breadth-first walk over `imports[].path`), one input per line, and exits 1.
    A metafile without `inputs` or `outputs`, no entry point, an input without `imports`, or a
    manifest it cannot find exits 2 with the reason. No folder name of this repository appears in
    the script.
  - `Makefile › bundle-check`: `WEB_BUNDLE = node_modules/.cache/web-bundle`;
    `bun build apps/web/app/main.ts --outdir $(WEB_BUNDLE) --target browser --metafile=$(WEB_BUNDLE)/meta.json`,
    then `bun .misc/lint/bundle-check.mjs $(WEB_BUNDLE)/meta.json`; the comment and the `##`
    help line say what it refuses.
  - `apps/web/package.json`: `"browserPackages": ["effect", "@app-template/http-api", "@app-template/packages/ui"]`.
  - `application/package.json`: `"sideEffects": false` removed; `http-api/package.json` keeps
    its own, since the contract is a browser library.
  - Docs: `docs/knowledge/tooling.md`'s `make bundle-check` row; `docs/knowledge/architecture.md`:
    *Boundary guards* row and the paragraph under the table (the metafile, not the keys), *Known
    gaps* (the namespace-import gap no longer reaches `http-api`; the server-library gap is
    closed), *Add a module* step 4 (no service key to grep); `architecture.md › Contracts` of this
    ticket: the mapping reads the manifests, not folder names; `docs/knowledge/decisions.md`:
    *Guards are configuration* and *A module's layers* › Guarded by name the bundle check over the
    metafile; `application/CLAUDE.md` no longer mentions `"sideEffects"`.
  - Leftovers: `grep -rn "sideEffects" --include=package.json application http-api apps`;
    `grep -rnE "grep.*service keys|greps the service keys|service keys" docs/ .claude/ application/`.
- **Size:** ~210.
- **Introduces:** `bundle-check.mjs` → the `bundle-check` recipe; `browserPackages` → the script.
  Removes later: none.
- **Test first:** Seam `make bundle-check` — with `import { sql } from 'drizzle-orm'` planted in
  `packages/ui/index.ts` and used inside `joinClassNames`, today's check passes (the metafile
  names `drizzle-orm` 51 times); the new check fails naming `drizzle-orm` and the chain
  `apps/web/app/main.ts → apps/web/features/health/health-panel.ts → packages/ui/index.ts → …`.
  R6's baseline, measured at plan time on `fd7c0a6464`: with `"sideEffects": false` removed from
  `http-api/package.json` and `application/package.json`, today's check fails, the bundle grows
  from 0.43 MB to 2.97 MB and holds the three chat services and `QueueConfig`; after S2 nothing
  of `application/` is imported, so the same build passes the new check.
- **Verify:**
  - `make check` — green.
  - Planted (R7): `import { Transaction } from '@app-template/packages/db'` used in
    `apps/web/app/main.ts` → `make bundle-check` exits 1 naming `@app-template/packages/db` and the
    chain; the `drizzle-orm` plant above → exits 1 naming `drizzle-orm`; each reverted after.
  - `grep -nE "(application|kernel|http-api|packages|apps)/" .misc/lint/bundle-check.mjs` —
    prints nothing; fails on a folder name in the check.
  - Planted (R6): in a `git clone --local` of the tree, `"sideEffects"` removed from every
    `package.json` under `http-api/` and `application/` → `make bundle-check` passes and its
    metafile lists no input under `application/`
    (`bun -e` over `node_modules/.cache/web-bundle/meta.json`); fails when a module file reaches
    the bundle.
  - Planted (exit 2): `meta.json` replaced with `{}` → `bun .misc/lint/bundle-check.mjs node_modules/.cache/web-bundle/meta.json`
    exits 2; fails on a clean pass over an empty graph.
  - `make lint` — green; `make doc-lint` — green.
  - **Probes** (Biome `http-api/**`, `application/*/contract/**`, `application/*/domain/**`
    overrides and `make bundle-check`, run at plan time on `fd7c0a6464`): each is one planted
    line, the file's first import, run with the guard's tool alone
    (`bunx biome lint <file> --colors=off`, `make bundle-check`) and reverted after. The step
    runs the same ten again: the first seven fail with their new messages, the last three with
    the package and its chain.
    - workspace in the contract — `http-api/shared/limits.ts`: `import { Db } from '@app-template/kernel/data'` → `lint/style/noRestrictedImports` 1:20 "http-api is the HTTP boundary shared by the apps: it imports only effect and a module's entry, …"; `Found 1 error.`
    - a module's service in the contract (the pattern S4 removes; after S4 the one pattern refuses it) — `http-api/shared/limits.ts`: `import { ChatService } from '@app-template/application/chat'` → `lint/style/noRestrictedImports` 1:10 "of a module's entry http-api takes only its contract and its domain: …"; `Found 1 error.`
    - a module's entry in the contract (the widened ban's own: passes until S4) — `http-api/shared/limits.ts`: `import { ChatId } from '@app-template/application/chat'` → no `noRestrictedImports` diagnostic, only `noUnusedImports`; `Found 1 warning.`
    - workspace in a module contract — `application/identity/contract/user.id.ts`: `import { Db } from '@app-template/kernel/data'` → `lint/style/noRestrictedImports` 1:20 "a module contract imports no workspace and no @effect/* package: every consumer of the module reads it, the browser too …"; `Found 1 error.`
    - a module's own file in its contract — `application/identity/contract/user.id.ts`: `import { User } from '#identity/domain/user.model'` → `lint/style/noRestrictedImports` 1:22 "a module contract imports none of its module's other files: …" (and `noImportCycles`)
    - workspace in a domain — `application/chat/domain/chat.id.ts`: `import { Db } from '@app-template/kernel/data'` → `lint/style/noRestrictedImports` 1:20 "a module's domain is pure and ships to the browser: it imports no workspace but another module's entry, …"; `Found 1 error.`
    - a service in a domain — `application/chat/domain/chat.id.ts`: `import { ChatService } from '#chat/services/chat.service'` → `lint/style/noRestrictedImports` 1:29 "a module's domain imports neither its services nor its infrastructure …" (and `noImportCycles`)
    - a kernel key in the bundle (today's grep ban; after S4 refused as `@app-template/kernel/data` with its chain) — `apps/web/app/main.ts`: `import { Db } from '@app-template/kernel/data'` and `console.log(Db.key)` → the grep prints `…main.js:class Db extends Service()("@app-template/kernel/data/Db", …` and six repository keys; `make: *** [bundle-check] Error 1`
    - a server library through an allowed package (the new check's own: passes until S4) — `packages/ui/index.ts`: `import { sql } from 'drizzle-orm'`, `void sql` first in `joinClassNames` → exit 0 after `bun build`'s `node:net` polyfill warnings; the metafile names `drizzle-orm` 51 times, so the library is in the bundle unseen
    - a server entry of a shared workspace (the new check's own: passes until S4) — `apps/web/app/main.ts`: `import { Transaction } from '@app-template/packages/db'` and `console.log(Transaction.key)` → exit 0 after the same `node:net` warnings; the entry is in the bundle unseen
- **Model:** `opus high`
- **Status:** todo
- **Findings:**

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1, S2, S4 |
| R2 | S2 |
| R3 | S2 |
| R4 | S1, S2 |
| R5 | S3 |
| R6 | S4 |
| R7 | S4 |
| R8 | S2 |
