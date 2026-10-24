# Local environment

A Pulumi project of its own: `ministack.ts` runs MiniStack through the Docker provider, and
`index.ts` creates inside it the database, the bucket and the queues from `deployment/aws`;
`settings.ts` reads the configuration once. What each does and the targets that run them:
[docs/knowledge/aws.md › The local stand-in](../../docs/knowledge/aws.md#the-local-stand-in);
how a bucket or a queue is added:
[docs/knowledge/aws.md › Adding a resource](../../docs/knowledge/aws.md#adding-a-resource).
