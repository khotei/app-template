# Pure models

Flow: lab · Base: 9a49a9593d (`refactor/model-members`, PR #63; this lab's PR opens onto it)

## Intent

The owner's, 2026-11-25, in their words:

- "Maybe we could group errors and models into single file, functions inside models will be new
  file … And http will import these models. Check if it possible to make then without external
  imports. Only others models are allowed."
- "if model will import kernel data this is wrong, it very easy to include backend, so we should
  find solution" — settled as "модель объявляет значения сама, таблица — свои … lets for now".
- The rules leave the class for groups by kind: "ChatGuard -> ensure, ChatStatus -> buildStatus,
  RunMove -> move rules", named `ChatPolicy`, `RunPolicy`, `RunMove`, `ChatState`, `RunState`
  ("RunPolicy", "ChatState - ok"); files with a dash ("i think there should be '-' not '.'");
  "класс со статиками - yes".
- "state, chat and funstions should state instead of status"; "run.status remain";
  "maxlength now only domain thing, remove from data table".
- "Logic which like encode,decode,(make insert,update), maybe we could create classes with static
  methods wich will accpet args (models, etc) and interanlly abstract it." — "Группа C. Кодеки -
  yes".
- "application/http-api"; issue #48, "Move to own module (auth). Review option to move identity
  to user and auth to identity module."
- "implement in another pr which will opened to current 63 … run in parallel agent with opus
  high".

What becomes visible: a model file imports `effect`, ids and other models only; the API contract
is a part of `application/` that imports models and errors, never a service; a chat's wire field
is `state`.

## Map

| Step | Goal, and how to see it | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | The chat domain owns its values; no `domain/` file imports the kernel · visible: `make lint` refuses a probe import of `@app-template/kernel/data` in a model; `make check` | minimal | build | done |
| L2 | A model's errors live in its model file · visible: no `application/*/domain/*.error.ts`; `make check` | minimal | build | done |
| L3 | Rules live in `ChatPolicy`, `RunPolicy`, `RunMove`, `ChatState`, `RunState`; the models hold no member and `Status` is gone · visible: `git grep -n "ensureNotBusy()\|\.start()" application apps` is empty; `make check` | minimal | build | done |
| L4 | A chat's wire field is `state` · visible: `apps/api/openapi.json` has `state` on `ApiChat`; the handler and e2e cases read it | minimal | build | done |
| L5 | Row coding is `RowCodec`'s statics over a model; the models hold no codec static · visible: `git grep -n "decodeOne\|makeInsert" application/*/domain` is empty; `make check` | minimal | build | done |
| L6 | A module's contract has an entry of its own, the only path a `domain/` may import of another module · visible: `make lint` refuses `@app-template/application/identity` in a model | minimal | build | done |
| L7 | The API contract is `application/http-api`; `Auth`'s and `SchemaErrors`' layers stay in `apps/api` · visible: `apps/api/openapi.json` unchanged by this step; `make check` | minimal | build | done |
| L8 | Issue #48: `user` holds the model, `identity` the recognising of a user and `Identity` · visible: `make check`; the issue closed by the PR | minimal | build | done |
| L9 | A module's contract entry holds its ids, models, errors and `ChatState`; `application/http-api` and another module's `domain/` import a module only through it · visible: `make lint` refuses a module's whole entry in `application/http-api` | minimal | build | done |
| L10 | Later: the items of the open list the owner picks | hard | build | not run: the owner picked none, each item is in the roadmap's Later |

The lab's rounds reached `refactor/model-members` as the squash of PR #64; a change that reads
services with `yield*` alone followed as PR #65, and the owner's review of PR #63 as rounds on
that branch. At the close: `make check` green with 186 unit and 82 e2e tests; the greps of L2, L3
and L5 empty; `git grep -n "@app-template/kernel" -- 'application/*/domain'` empty.

## L1 — The chat domain owns its values

### Output

The models declare `RunStatus`, `RunFailure`, the message authors, `maxTitleLength` and
`textPattern`; the tables keep their own. `chats_title_check` lost its upper bound by a
migration. Biome refuses every `@app-template/kernel/**` in `application/*/domain/**`. The active
statuses, which each side declares and no call compares, are held together by a case of
`run.service.test.ts` (the owner's review of PR #63 moved the check out of `run.service.ts`: "I
don't want to mess this like utils logic or test logic inside main code").

## L2 — A model's errors live in its model file

### Output

`chat.error.ts`, `run.error.ts`, `message.error.ts` and `user.error.ts` merged into their models'
files; the `.error` row of `naming.md` keeps a kernel part's.

## L3 — Rules in groups by kind

### Output

`chat-policy.ts`, `run-policy.ts`, `run-move.ts`, `chat-state.ts` and `run-state.ts` hold the
static-only groups; the models hold no member and import no group; `status.model.ts` is gone. A
status move is written `runs.update(run, yield* RunMove.<move>(run, …))`. `ChatState.isNew` takes
what `build` takes, the newest Run by the field a state reads (the owner's review of PR #63).

## L4 — A chat's wire field is `state`

### Output

`ApiChat` carries `state`, set by `apps/api/chat/chat.mapper.ts` through `ChatState.build`; the
snapshot, the web's generated client, the handler tests and the e2e follow. A Run's field stays
`status`.

## L5 — Row coding as `RowCodec`

### Output

`packages/schema` holds `RowCodec` (`decodeOne`, `decodeMany`, `makeInsert`, `makeUpdate`); the
models hold no codec static. `makeUpdate` drops only the fields its variant renews, found by the
`Override` marker, and its type says the same as its run (a review's finding, fixed by a red test
first).

## L6 — A contract entry per module

### Output

`@app-template/application/<module>/contract` is an entry of its own, the only path another
module's `domain/**` may import. Measured: the identity contract's entry reads 53 files and no
drizzle file, the module's whole entry 488 and 123.

## L7 — The API contract in `application/http-api`

### Output

`application/http-api` holds `api.ts`, the three `.http` files and `api-security.ts` (the
definitions); `apps/api/shared/api-security.layer.ts` holds `AuthLayer` and `SchemaErrorsLayer`.
Biome refuses `@app-template/application/http-api` in a module's services, infrastructure, their
tests and the use cases. The owner's review of PR #63 kept the place and the name: `apps/api`
would close the contract to the web, `rest` promises more than a resource-oriented API of
Richardson's level 2.

## L8 — Issue #48: `user` and `identity`

### Output

`application/user` holds `User` and `UserId`; `application/identity` holds `IdentityService`
(`recognise`, `authenticate`), `IdentityUnknownError` and the request's value
`Identity { userId }`. The table `credentials` keeps its name. No bundle check is left in the
Makefile or the web (the owner: "It will be task of web framework").

## L9 — A module's contract holds what others may take

### Output

A module's contract exports by name its ids, models, errors and `ChatState`;
`application/http-api` and another module's `domain/**` import a module only through it, and
Biome refuses a rule group re-exported past that list.

## Knowledge

- A model and its table each declare a value; a call's type compares them wherever a row passes
  between a service and a repository. A list no call passes (the active statuses) needs a test.
- `RowCodec.makeUpdate` renews a field only when its update variant marks it `Override`.
- The piped `Effect.onError` takes its error type from the cleanup's `Cause.Cause<E>` parameter:
  a cleanup typed over `Cause.Cause<unknown>` turns the pipeline's error into `unknown`.
- On an Effect idiom the vendored source decides before a local rule:
  `repos/effect/migration/services.md` prefers `yield*` over `use`, and the rule followed.

## Later

Each item moved to [roadmap.md › From `pure-models`](../../knowledge/roadmap.md#from-pure-models)
on the owner's yes, 2026-11-26:

- The contract shared with the browser (`HttpApiClient.make(Api)`) — L7
- `<name>SetColumns` copy the update variant by hand — `kernel/data/chat/run.entity.ts`
- An outbox for a job sent after its writes' commit — `ask-chat.service.ts`
- The hook-service pattern named in "Use cases above the modules" — `docs/knowledge/decisions.md`
- The `#testing/<module>/*` alias passes in a domain's source — `.misc/lint/biome.base.json`
- A service read through a lower-case alias or `this.use` passes the Grit plugin
- No pagination on the lists of chats and messages — `application/http-api/chat.http.ts`
