# deployment

Two Pulumi projects: `local/` runs MiniStack in Docker, and `aws/` is the AWS infrastructure,
live for its `local` stack on MiniStack (the database instance); its other resource files are
stubs until the deploy ticket lands. How both run: `docs/knowledge/aws.md › The local stand-in`.

- `make down` destroys `local/` only. Never move a resource that holds data into `local/`: its
  destroy would take the data with it.
- May import `packages/*` only; never a layer or an app.
- Resource names come from `@app-template/aws` (`buildResourceName`,
  `app-template-<stage>-<resource>`) and tags from `shared/tags.ts`; never hard-code either in a
  resource file.
- Keep `@pulumi/pulumi` in `package.json` even where no file imports it: Pulumi loads it to run
  the program.
