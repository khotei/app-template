import { Layer } from 'effect'

import { AttachmentRepositoryTest, AttachmentRows } from '#testing/attachment.test-fake'
import {
  ChatRepositoryTest,
  ChatRows,
  MessageRepositoryTest,
  MessageRows,
} from '#testing/chat.test-fake'
import { UserRepositoryTest, UserRows } from '#testing/user.test-fake'

/** The data layer's memory repositories over fresh rows, the rows in context for a test to read. */
export const RepositoryStackTest = Layer.mergeAll(
  UserRepositoryTest,
  ChatRepositoryTest,
  AttachmentRepositoryTest,
).pipe(
  Layer.provideMerge(MessageRepositoryTest),
  Layer.provideMerge(
    Layer.mergeAll(UserRows.layer, ChatRows.layer, MessageRows.layer, AttachmentRows.layer),
  ),
)
