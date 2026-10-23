# Local environment

A Pulumi project of its own: `ministack.ts` runs MiniStack through the Docker provider,
`check-database.ts` checks that the database instance of `deployment/aws` publishes the port of
`DATABASE_URL`, and `provision.ts` creates the inventory of `@app-template/aws` on MiniStack.
What each does and the targets that run them:
[docs/knowledge/aws.md › The local stand-in](../../docs/knowledge/aws.md#the-local-stand-in);
how a bucket or a queue is added:
[docs/knowledge/aws.md › Adding a resource](../../docs/knowledge/aws.md#adding-a-resource).
