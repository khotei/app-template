import { Layer } from 'effect'

import { AttachmentRepositoryTest, AttachmentRows } from '#testing/data/attachment.test-fake'
import {
  ChatRepositoryTest,
  ChatRows,
  MessageRepositoryTest,
  MessageRows,
  RunRepositoryTest,
  RunRows,
} from '#testing/data/chat.test-fake'
import { FileObjects, FileRepositoryTest } from '#testing/data/file.test-fake'
import { UserRepositoryTest, UserRows } from '#testing/data/user.test-fake'

/**
 * The data layer's memory repositories over fresh rows and objects, both in context for a test to
 * read.
 */
export const RepositoryStackTest = Layer.mergeAll(
  UserRepositoryTest,
  AttachmentRepositoryTest,
  FileRepositoryTest,
  RunRepositoryTest,
).pipe(
  Layer.provideMerge(Layer.mergeAll(ChatRepositoryTest, MessageRepositoryTest)),
  Layer.provideMerge(
    Layer.mergeAll(
      UserRows.layer,
      ChatRows.layer,
      MessageRows.layer,
      AttachmentRows.layer,
      RunRows.layer,
      FileObjects.layer,
    ),
  ),
)
