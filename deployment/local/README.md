# Local environment

A Pulumi project of its own: `index.ts` runs `ministack.ts` (MiniStack) and `postgres.ts` (the
local database) through the Docker provider, and `provision.ts` creates the inventory of
`@app-template/aws` on MiniStack. What each does and the targets that run them:
[docs/knowledge/aws.md › The local stand-in](../../docs/knowledge/aws.md#the-local-stand-in);
how a bucket or a queue is added:
[docs/knowledge/aws.md › Adding a resource](../../docs/knowledge/aws.md#adding-a-resource).
