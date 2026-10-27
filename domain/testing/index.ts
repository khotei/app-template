import { Layer } from 'effect'

import { AttachmentRepositoryTest, AttachmentRows } from '#domain/testing/attachment.test-fake'
import {
  ChatRepositoryTest,
  ChatRows,
  MessageRepositoryTest,
  MessageRows,
} from '#domain/testing/chat.test-fake'
import { UserRepositoryTest, UserRows } from '#domain/testing/user.test-fake'

export * from '#domain/testing/attachment.test-fake'
export * from '#domain/testing/attachment.test-fixture'
export * from '#domain/testing/chat.test-fake'
export * from '#domain/testing/chat.test-fixture'
export * from '#domain/testing/user.test-fake'
export * from '#domain/testing/user.test-fixture'

/** The four repositories over fresh rows, the rows in context for a test to arrange or read. */
export const RepositoryStackTest = Layer.mergeAll(
  UserRepositoryTest,
  ChatRepositoryTest,
  MessageRepositoryTest,
  AttachmentRepositoryTest,
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(UserRows.layer, ChatRows.layer, MessageRows.layer, AttachmentRows.layer),
  ),
)
