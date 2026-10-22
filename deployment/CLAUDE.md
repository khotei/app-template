# deployment

Two Pulumi projects: `local/` runs MiniStack in Docker for `make up` (live), and `aws/` is the
AWS infrastructure (a typed stub until the deploy ticket lands; it imports no `@pulumi/*` yet).
How the local one runs: `docs/knowledge/aws.md › The local stand-in`.

- May import `packages/*` only; never a layer or an app.
- Resource names come from `@app-template/aws` (`buildResourceName`,
  `app-template-<stage>-<resource>`) and tags from `shared/tags.ts`; never hard-code either in a
  resource file.
- Keep `@pulumi/pulumi` in `package.json` even where no file imports it: Pulumi loads it to run
  the program.
