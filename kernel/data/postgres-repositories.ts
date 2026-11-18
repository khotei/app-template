import { Layer } from 'effect'

import { AttachmentRepository } from '#kernel/data/attachment/attachment.repository'
import { ChatRepository } from '#kernel/data/chat/chat.repository'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import { RunRepository } from '#kernel/data/chat/run.repository'
import { UserRepository } from '#kernel/data/user/user.repository'

export const PostgresRepositories = Layer.mergeAll(
  UserRepository.layer,
  ChatRepository.layer,
  MessageRepository.layer,
  RunRepository.layer,
  AttachmentRepository.layer,
)
