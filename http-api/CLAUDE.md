# http-api

The API contract: one `HttpApi` that `apps/api` implements and the browser calls through
`ApiClient`. It declares the wire itself: every id, constrained string, model shape, error, limit
and the auth middleware. Why:
[The API contract on its own](../docs/knowledge/decisions.md#the-api-contract-on-its-own).

- **Imports only `effect`:** no workspace and no `@effect/*` package, and no Bun API or Node
  built-in, since it ships to the browser. The domain's schemas are restated here, never
  imported.
- **A twin keeps the domain's export name.** A schema the domain declares too (an id, a
  constrained string, a status list, an error) is exported here under the domain's name and
  brand, so the api's twins test pairs it by name and fails on a drifted check. One under
  another name is compared with nothing, so review refuses it.
- **A model's wire shape is `Api<Model>`, a `Schema.Struct`,** never a class: it encodes the
  domain's instance as it is and writes only its own fields, so an internal field stays off the
  wire. An `Option` is `Schema.OptionFromNullOr`. The api hands it the model through its
  `buildApi<Model>`, which typechecks only while the two shapes match.
- **An error is a `Schema.TaggedError` with the domain's tag and its status on the class**
  (`{ httpApiStatus: <code> }`): the contract's class encodes the domain's instance, so a
  handler fails with the domain's errors as they are.
- **A wire change is a contract edit:** `make api-check` fails on it until `make api-snapshot`
  moves `openapi.json` with it.
