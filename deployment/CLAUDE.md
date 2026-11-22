# deployment

`local/` is the Pulumi program of `make up`: MiniStack and the telemetry backend in Docker, and
inside MiniStack the resources of `aws/`. `aws/` holds the resource code as functions of an
`aws.Provider`, so an AWS stack calls the same code. How it runs:
[aws.md › The local stand-in](../docs/knowledge/aws.md#the-local-stand-in).

- Never run `pulumi destroy` or `up --refresh` on the local stack; `make down` and `make reset`
  work through Docker (why: the same section).
- Never hard-code a resource's name or tags in a resource file: names follow the kernel's naming
  rule ([aws.md › The inventory](../docs/knowledge/aws.md#the-inventory)), tags the stack's shared
  tag helper.
