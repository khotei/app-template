import { Layer } from 'effect'

import { ChatService } from '#domain/chat/chat.service'
import { AttachmentBucketTest } from '#domain/testing/attachment.test-fake'
import { chat } from '#domain/testing/chat.test-fixture'
import { insertChatLayer, RepositoryStackTest } from '#domain/testing/repository-stack.test-layer'

/** The chat services over the memory layers, on fresh rows where `chat` exists. */
export const ChatTest = ChatService.layer.pipe(
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(Layer.merge(RepositoryStackTest, AttachmentBucketTest)),
)
