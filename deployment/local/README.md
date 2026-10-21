# Local environment

`docker-compose.yml` runs MiniStack, the local stand-in for S3 and SQS; `provision.ts` creates the
inventory of `@app-template/aws` on it under `STAGE`. Both run through the root `Makefile`:
`make up`, `make down`, `make reset`. How it fits together, and how to add a resource:
[docs/knowledge/aws.md](../../docs/knowledge/aws.md).

Postgres arrives with the first database client.
