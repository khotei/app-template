# deployment

Local environment (`local/`: Docker Compose and the provisioner) and AWS infrastructure (`aws/`,
Pulumi).

- `aws/` is a typed stub until the deploy ticket lands: no `@pulumi/*` dependency.
- May import `packages/*` only; never a layer or an app.
- Resource names come from `@app-template/aws` (`buildResourceName`,
  `app-template-<stage>-<resource>`) and tags from `shared/tags.ts`; never hard-code either in a
  resource file.
- The MiniStack image is pinned by digest in `local/docker-compose.yml` and in
  `packages/testing/ministack.ts`; bump both together.
