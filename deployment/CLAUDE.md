# deployment

Local environment (`local/`: Docker Compose and the provisioner) and AWS infrastructure (`aws/`,
Pulumi). How the local stand-in runs, and where its image is pinned:
`docs/knowledge/aws.md › The local stand-in`.

- `aws/` is a typed stub until the deploy ticket lands: no `@pulumi/*` dependency.
- May import `packages/*` only; never a layer or an app.
- Resource names come from `@app-template/aws` (`buildResourceName`,
  `app-template-<stage>-<resource>`) and tags from `shared/tags.ts`; never hard-code either in a
  resource file.
