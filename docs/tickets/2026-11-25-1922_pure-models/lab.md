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
| L1 | The chat domain owns its values; no `domain/` file imports the kernel · visible: `make lint` refuses a probe import of `@app-template/kernel/data` in a model; `make check` | minimal | build | in progress |
| L2 | A model's errors live in its model file · visible: no `application/*/domain/*.error.ts`; `make check` | minimal | build | in progress |
| L3 | Rules live in `ChatPolicy`, `RunPolicy`, `RunMove`, `ChatState`, `RunState`; the models hold no member and `Status` is gone · visible: `git grep -n "ensureNotBusy()\|\.start()" application apps` is empty; `make check` | minimal | build | todo |
| L4 | A chat's wire field is `state` · visible: `apps/api/openapi.json` has `state` on `ApiChat`; the handler and e2e cases read it | minimal | build | todo |
| L5 | Row coding is `RowCodec`'s statics over a model; the models hold no codec static · visible: `git grep -n "decodeOne\|makeInsert" application/*/domain` is empty; `make check` | minimal | build | todo |
| L6 | A module's contract has an entry of its own, the only path a `domain/` may import of another module · visible: `make lint` refuses `@app-template/application/identity` in a model | minimal | build | todo |
| L7 | The API contract is `application/http-api`; `Auth`'s and `SchemaErrors`' layers stay in `apps/api` · visible: `apps/api/openapi.json` unchanged by this step; `make check` | minimal | build | todo |
| L8 | Issue #48: `user` holds the model, `identity` the recognising of a user and `CurrentUser` · visible: `make check`; the issue closed by the PR | minimal | build | todo |
| L9 | Later: the items of the open list the owner picks | hard | build | todo |

L1 to L4 run in one tree in order; L5 and L6 + L7 each in a tree of their own beside it; L8
follows their joining.

## L1 — The chat domain owns its values

### Shape

- `run.model.ts` declares `RunStatus` (`Schema.Literals` of its four) and `RunFailure`;
  `message.model.ts` its authors; `chat.model.ts` `maxTitleLength`; `textPattern` moves into the
  domain. The tables keep their own declarations; the probe's diff:
  `scratchpad/model-values/s1-probe.patch` of the session, measured there.
- `maxTitleLength` leaves `kernel/data` and the check `chats_title_check` loses its upper bound,
  by a migration; the kernel's unused `textPattern` goes.
- The active statuses are the domain's own list; one line in `run.service.ts` holds it to the
  index's: `<the domain's list> satisfies typeof <the kernel's activeRunStatuses>` (the owner's
  yes to that line).
- Biome: the `application/*/domain/**` override refuses every `@app-template/kernel/**`.

### Notes

- [N:ai] Measured by the probe: a status, an author or a required `RunFailure` field changed on
  one side fails `make typecheck` in the services; an optional `RunFailure` field on one side is
  not caught and is harmless (the extra key is dropped on decode).

## L2 — A model's errors live in its model file

### Shape

`chat.error.ts`, `run.error.ts`, `message.error.ts` and `user.error.ts` merge into their models'
files; the `.error` row of `naming.md` keeps the kernel's and a contract's.

## L3 — Rules in groups by kind

### Shape

```ts
// application/chat/domain/chat-policy.ts, run-policy.ts, run-move.ts, chat-state.ts, run-state.ts
export class ChatPolicy { static readonly ensureNotBusy = … }
export class RunPolicy  { static readonly ensureUnstarted = …; static readonly ensureRetryable = … }
export class RunMove    { static readonly start = …; static readonly complete = …; static readonly fail = … }
export class ChatState  { static readonly values = Schema.Literals(['idle', 'queued', 'failed'])
                          static readonly build = …; static readonly isNew = … }
export class RunState   { static readonly isActive = …; static readonly isStarted = … }
```

- The models lose every member and import no group; a caller writes
  `ChatPolicy.ensureNotBusy(chat.run)`, `RunMove.start(queued)`.
- A static calls another by the class's name, never `this`: a static passed as a value
  (`Effect.flatMap(ChatPolicy.ensureNotBusy)`) must run.
- `status.model.ts` (`Status`, `hasStatus`) goes; each side declares its own values.
- The api computes a chat's state in `apps/api/chat/chat.mapper.ts` through `ChatState.build`;
  in this step the wire still says `status`.
- Biome: `noStaticOnlyClass` off for `application/*/domain/**`.
- The rules' parameter types stay the fields they read, as PR #63 left them.

## L4 — A chat's wire field is `state`

### Shape

`ApiChat` is `Chat.json.mapFields(Struct.assign({ state: ChatState.values }))`; the mapper sets
`state`. The snapshot, the web's generated client, the handler tests and the e2e follow. A Run's
field stays `status`.

## L5 — Row coding as `RowCodec`

### Shape

```ts
// packages/schema
export class RowCodec {
  static readonly decodeOne = <M extends Model.Any>(model: M) => …   // Option of a row → Option of the model
  static readonly decodeMany = …
  static readonly makeInsert = <M extends Model.Any>(model: M) => …  // { set, row }
  static readonly makeUpdate = …                                     // drops what the update variant renews
}
// a service
const { set, row } = yield* RowCodec.makeInsert(Chat)({ userId })
```

- The models lose `decodeOne`, `decodeMany`, `makeInsert`, `makeUpdate` and their
  `packages/schema` import of the codecs.
- `makeUpdate` finds the fields its variant renews (`updatedAt`) by Effect's own marker, the
  `Override` brand and the update variant's constructor default, never by name; a type test
  holds that only those are dropped.
- A refused make dies as a `Schema.SchemaError`, as `makeRowWith` does since PR #63.
- Biome: `noStaticOnlyClass` off for the file that holds `RowCodec`.
- Measured shapes and the probe: the session's `scratchpad/codec-classes/`.

## L6 — A contract entry per module

### Shape

`@app-template/application/<module>/contract` is an entry of its own; a module's `domain/**`
may import of another module only that path. Rewrites the "an export per layer" rejection of
"A module's layers".

## L7 — The API contract in `application/http-api`

### Shape

```
application/http-api/   api.ts, chat.http.ts, user.http.ts, health.http.ts,
                        api-security.ts (Auth, SchemaErrors, CurrentUser, RequestInvalidError: definitions)
apps/api/shared/api-security.layer.ts   AuthLayer, SchemaErrorsLayer
apps/api/**                              the handlers, the mapper, the snapshot and its test
```

`http-api` takes of a module its models, ids and errors, never a service (a Biome override).
The wire is unchanged by this step.

## L8 — Issue #48: `user` and `identity`

### Shape

`application/user` holds `User`, `UserId` and the user's record; `application/identity` holds
the recognising of a user (`authenticate`, `recognise`, the secret, `UserUnknownError`) and
`CurrentUser`. The split of `UserService` is drafted by the implementer as a `[D:ai]` before it
is built.

## Knowledge

## Later

- The contract shared with the browser (`sideEffects: false`, a values file, the web on
  `HttpApiClient.make(Api)`) — L7 — roadmap Later, by the owner's "5. yes"
- `<name>SetColumns` copy the update variant by hand — `kernel/data/chat/run.entity.ts:20` — open
- An outbox for a job sent inside a caller's transaction — `ask-chat.service.ts:52` — open
- The hook-service pattern named in "Use cases above the modules" — `docs/knowledge/decisions.md` — open
