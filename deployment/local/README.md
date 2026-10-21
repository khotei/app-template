# Local environment

A Pulumi project of its own: `ministack.ts` runs MiniStack through the Docker provider, and
`provision.ts` creates the inventory of `@app-template/aws` on it. What each does, the targets
that run them, and how to add a resource:
[docs/knowledge/aws.md › The local stand-in](../../docs/knowledge/aws.md#the-local-stand-in).

Postgres arrives with the first database client.
