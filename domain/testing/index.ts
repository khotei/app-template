import { Layer } from 'effect'

import { AttachmentRepositoryMemory, AttachmentRows } from '#domain/testing/attachment.fake'
import {
  ChatRepositoryMemory,
  ChatRows,
  MessageRepositoryMemory,
  MessageRows,
} from '#domain/testing/chat.fake'
import { UserRepositoryMemory, UserRows } from '#domain/testing/user.fake'

export * from '#domain/testing/attachment.fake'
export * from '#domain/testing/attachment.fixture'
export * from '#domain/testing/chat.fake'
export * from '#domain/testing/chat.fixture'
export * from '#domain/testing/user.fake'
export * from '#domain/testing/user.fixture'

/** The four repositories over fresh rows, the rows in context for a test to arrange or read. */
export const RepositoryStackMemory = Layer.mergeAll(
  UserRepositoryMemory,
  ChatRepositoryMemory,
  MessageRepositoryMemory,
  AttachmentRepositoryMemory,
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(UserRows.layer, ChatRows.layer, MessageRows.layer, AttachmentRows.layer),
  ),
)
