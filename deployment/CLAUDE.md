# deployment

Local environment (`local/docker-compose.yml`) and AWS infrastructure (`aws/`, Pulumi).

- Every file is a typed stub until the deploy ticket lands: no `@pulumi/*` dependency, and
  `docker-compose.yml` declares no services yet.
- May import `packages/*` only; never a layer or an app.
- Resource names come from `shared/naming.ts` (`app-template-<stage>-<resource>`) and tags from
  `shared/tags.ts`; never hard-code either in a resource file.
