import { Effect } from 'effect'

import {
  type Attachment,
  AttachmentService,
  type ChatId,
  ChatService,
  chatTitleQueue,
  ensureAllReachableFrom,
  ensureAllUnbound,
  ensureChatNotBusy,
  ensureMessageInput,
  FileAttachmentService,
  GenerateChatTitle,
  isNewChat,
  type MessageInput,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import { Transaction } from '@app-template/packages/db'
import { QueueSender } from '@app-template/packages/queue'

import { sendGenerateAssistantMessage } from '#use-cases/chat/chat.sender'

/** The message, its bind and its Run commit together: a Run that loses the race keeps none. */
const storeUserMessage = Effect.fnUntraced(
  function* (chatId: ChatId, input: MessageInput, requested: ReadonlyArray<Attachment>) {
    const messages = yield* MessageService
    const attachments = yield* AttachmentService
    const runs = yield* RunService

    // The bind follows the message, since its key to the message is not deferrable.
    const message = yield* messages.create({ chatId, text: input.text, author: 'user' })
    yield* attachments.bind(requested, message)
    return yield* runs.create(message)
  },
  (writes) => Transaction.use((transaction) => transaction.run(writes)),
)

/**
 * Stores the user's message with its attachments bound and the queued Run that answers it,
 * then sends its jobs.
 */
export const createUserMessage = Effect.fn('createUserMessage')(function* (
  userId: UserId,
  chatId: ChatId,
  input: MessageInput,
) {
  const chats = yield* ChatService
  const fileAttachments = yield* FileAttachmentService
  const queue = yield* QueueSender

  yield* ensureMessageInput(input)
  const chat = yield* chats.getOne({ id: chatId, userId }).pipe(Effect.tap(ensureChatNotBusy))
  // Read before the transaction, so its S3 heads run outside it; the bind's write dies on one
  // a send bound since.
  const requested = yield* fileAttachments
    .getMany({ id: input.attachmentIds, userId })
    .pipe(Effect.flatMap(ensureAllReachableFrom(chatId)), Effect.flatMap(ensureAllUnbound))

  const run = yield* storeUserMessage(chatId, input, requested)

  // The title job goes first: a reply job SQS refuses fails the create, and no retry sends a
  // title.
  if (isNewChat(chat)) {
    const messageId = run.userMessageId
    yield* queue
      .send(chatTitleQueue, new GenerateChatTitle({ messageId }))
      .pipe(
        Effect.ignore({ log: 'Error', message: 'chat title not queued' }),
        Effect.annotateLogs({ chatId, messageId }),
      )
  }
  yield* sendGenerateAssistantMessage(run)
  return run
})
