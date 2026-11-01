import { Layer } from 'effect'

import { ChatService } from '#services/chat.service'
import { AttachmentBucketTest } from '#testing/attachment.test-fake'
import { chat } from '#testing/chat.test-fixture'
import { insertChatLayer, RepositoryStackTest } from '#testing/repository-stack.test-layer'

/** The chat services over the memory layers, on fresh rows where `chat` exists. */
export const ChatTest = ChatService.layer.pipe(
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(Layer.merge(RepositoryStackTest, AttachmentBucketTest)),
)
