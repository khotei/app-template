import { Layer } from 'effect'

import { AttachmentRepositoryTest, AttachmentRows } from '#testing/attachment.test-fake'
import {
  ChatRepositoryTest,
  ChatRows,
  MessageRepositoryTest,
  MessageRows,
} from '#testing/chat.test-fake'
import { FileObjects, FileRepositoryTest } from '#testing/file.test-fake'
import { UserRepositoryTest, UserRows } from '#testing/user.test-fake'

/**
 * The data layer's memory repositories over fresh rows and objects, both in context for a test to
 * read.
 */
export const RepositoryStackTest = Layer.mergeAll(
  UserRepositoryTest,
  ChatRepositoryTest,
  AttachmentRepositoryTest,
  FileRepositoryTest,
).pipe(
  Layer.provideMerge(MessageRepositoryTest),
  Layer.provideMerge(
    Layer.mergeAll(
      UserRows.layer,
      ChatRows.layer,
      MessageRows.layer,
      AttachmentRows.layer,
      FileObjects.layer,
    ),
  ),
)
