# deployment

`local/` is the Pulumi program of `make up`: MiniStack in Docker, and inside it the resources of
`aws/`. `aws/` holds the resource code as functions of an `aws.Provider` (the database, the
bucket, the queues), so an AWS stack calls the same code; its other files are stubs until the
deploy ticket lands. How it runs: `docs/knowledge/aws.md › The local stand-in`.

- Never run `pulumi destroy` or `up --refresh` on the local stack: Pulumi cannot remove the
  container before what lives in it, and a refresh while MiniStack is down drops the bucket from
  the state. `make down` and `make reset` work through Docker.

- May import `packages/*` only; never a layer or an app.
- Resource names come from `@app-template/aws` (`buildResourceName`,
  `app-template-<stage>-<resource>`) and tags from `shared/tags.ts`; never hard-code either in a
  resource file.
- Keep `@pulumi/pulumi` in `package.json` even where no file imports it: Pulumi loads it to run
  the program.
