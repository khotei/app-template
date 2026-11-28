# deployment

`local/` is the Pulumi program of `make up`: MiniStack and the telemetry backend in Docker, and
inside MiniStack the resources of `aws/`. `aws/` holds the resource code as functions of an
`aws.Provider`, so an AWS stack calls the same code. How it runs:
[aws.md › The local stand-in](../docs/knowledge/aws.md#the-local-stand-in).

- `alchemy.run.ts` is the Alchemy stack that replaces `local/` and `aws/`, one file per
  resource or group beside it (`Queues.ts`, `Database.ts`, `Files.ts`), in Alchemy's own file
  names; `make dev-stack` runs it on floci. Before naming an Alchemy API, read
  `.claude/rules/alchemy.md`. While both stand, the rules below bind `local/` and `aws/` alone.
- Never run `pulumi destroy` or `up --refresh` on the local stack; `make down` and `make reset`
  work through Docker (why: the same section).
- Never hard-code a resource's name or tags in a resource file: names follow the kernel's naming
  rule ([aws.md › The inventory](../docs/knowledge/aws.md#the-inventory)), tags the stack's shared
  tag helper.
