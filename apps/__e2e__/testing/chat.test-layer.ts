import { BunCrypto } from '@effect/platform-bun'
import { Layer } from 'effect'

import { chat, insertChatLayer } from '@app-template/domain/testing'
import { AttachmentBucketS3, AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { ChatPg } from '@app-template/infrastructure/chat'
import { Transaction } from '@app-template/infrastructure/db'
import { QueueSenderOutbox } from '@app-template/infrastructure/shared'
import { AwsTest } from '@app-template/infrastructure/testing-e2e'
import { ChatServices } from '@app-template/use-cases/testing'

import { DbWithUsersTest } from '#testing-e2e/db.test-layer'

/**
 * The chat services and use cases on a fresh test database where `chat` exists, over the real
 * transaction, the outbox and the attachments bucket of a stage of the test's own: for what only
 * Postgres decides, a rollback.
 */
export const ChatPgTest = ChatServices.pipe(
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(
    Layer.mergeAll(
      ChatPg,
      AttachmentRepositoryPg,
      AttachmentBucketS3,
      QueueSenderOutbox,
      Transaction.layer,
    ),
  ),
  Layer.provideMerge(DbWithUsersTest),
  Layer.provide([AwsTest, BunCrypto.layer]),
)
