import { Effect } from 'effect'

import { QueueSender } from '@app-template/packages/queue'

import type { MessageFields } from '#chat/domain/message.model'
import type { Run } from '#chat/domain/run.model'
import {
  assistantMessageQueue,
  chatTitleQueue,
  GenerateAssistantMessage,
  GenerateChatTitle,
} from '#chat/infrastructure/chat.queue'

/** Sends the job that answers the Run; one SQS refuses fails with its `QueueError`. */
export const sendGenerateAssistantMessage = Effect.fn('sendGenerateAssistantMessage')((run: Run) =>
  QueueSender.use((queue) =>
    queue.send(assistantMessageQueue, new GenerateAssistantMessage({ runId: run.id })),
  ).pipe(Effect.annotateLogs({ chatId: run.chatId, runId: run.id })),
)

/** Sends the job that titles the message's chat; one SQS refuses is logged, and the send goes on. */
export const sendGenerateChatTitle = Effect.fn('sendGenerateChatTitle')(
  (message: Pick<MessageFields, 'id' | 'chatId'>) =>
    QueueSender.use((queue) =>
      queue.send(chatTitleQueue, new GenerateChatTitle({ messageId: message.id })),
    ).pipe(
      Effect.ignore({ log: 'Error', message: 'chat title not queued' }),
      Effect.annotateLogs({ chatId: message.chatId, messageId: message.id }),
    ),
)
