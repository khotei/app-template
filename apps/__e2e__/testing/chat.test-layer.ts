import { BunCrypto } from '@effect/platform-bun'
import { Layer } from 'effect'

import { chat, insertChatLayer } from '@app-template/chat/testing'
import { Transaction } from '@app-template/db'
import { AwsTest } from '@app-template/kernel/aws/testing-e2e'
import { AttachmentRepository } from '@app-template/kernel/data/attachment'
import { ChatRepository, MessageRepository } from '@app-template/kernel/data/chat'
import { FileRepository } from '@app-template/kernel/data/file'
import { JobRepository } from '@app-template/kernel/data/job'
import { QueueSenderJobs } from '@app-template/kernel/queue'
import { ChatServices } from '@app-template/use-cases/testing'

import { DbWithUsersTest } from '#testing-e2e/db.test-layer'

/**
 * The chat services and use cases on a fresh test database where `chat` exists, over the real
 * transaction, the jobs and the files in the bucket of a stage of the test's own: for what only
 * Postgres decides, a rollback.
 */
export const ChatPgTest = ChatServices.pipe(
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(
    Layer.mergeAll(
      ChatRepository.layer,
      MessageRepository.layer,
      AttachmentRepository.layer,
      FileRepository.layer,
      QueueSenderJobs.pipe(Layer.provide(JobRepository.layer)),
      Transaction.layer,
    ),
  ),
  Layer.provideMerge(DbWithUsersTest),
  Layer.provide([AwsTest, BunCrypto.layer]),
)
