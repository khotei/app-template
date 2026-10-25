import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema } from 'effect'

import {
  type Attachment,
  AttachmentId,
  AttachmentRepository,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import {
  buildAssistantMessage,
  buildUserMessage,
  ChatId,
  completeMessage,
  failMessage,
  generateMessage,
  Message,
  MessageId,
  MessageRepository,
  prepareMessage,
} from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { insertOwnedChats, RepositoryStackPgTest } from '#infrastructure/testing/repository-stacks'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const at = (seconds: number) => DateTime.add(createdAt, { seconds })

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')

const userMessage = (
  id: string,
  {
    chatId,
    attachmentIds = [],
    seconds = 0,
  }: { chatId: ChatId; attachmentIds?: ReadonlyArray<AttachmentId>; seconds?: number },
) =>
  buildUserMessage({
    id: MessageId.make(id),
    chatId,
    text: 'Hi',
    attachmentIds,
    createdAt: at(seconds),
  })

const assistantMessage = (
  id: string,
  { chatId, seconds = 0 }: { chatId: ChatId; seconds?: number },
) => buildAssistantMessage({ id: MessageId.make(id), chatId, createdAt: at(seconds) })

const attachment = (id: string, seconds: number) =>
  buildAttachment({
    id: AttachmentId.make(id),
    userId,
    fileName: FileName.make('photo.png'),
    mediaType: MediaType.make('image/png'),
    size: FileSize.make(1024),
    createdAt: at(seconds),
  })

const SelectedMessage = Schema.Option(Message)

const Messages = Schema.Array(Message)

/** Uploads the attachments, then binds them to the message, as a send does. */
const bindAttachments = (attachments: ReadonlyArray<Attachment>, message: Message) =>
  Effect.gen(function* () {
    const repository = yield* AttachmentRepository

    yield* Effect.forEach(attachments, repository.insert, { discard: true })
    yield* repository.bind(
      Arr.map(attachments, (each) => each.id),
      message.id,
    )
  })

describe('MessageRepositoryPg', () => {
  it.effect("selects the chat's messages in creation order, not id order", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000040')
      const other = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000041')
      const question = userMessage('0192d4e0-7b3a-7c00-8000-000000000052', { chatId })
      const reply = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000051', { chatId, seconds: 1 })
      yield* insertOwnedChats(userId, [chatId, other])
      yield* Effect.forEach(
        [question, userMessage('0192d4e0-7b3a-7c00-8000-000000000050', { chatId: other }), reply],
        (each) => messages.insert(each),
      )

      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [question, reply])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('selects a queued assistant message as active, and none once it completes', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000042')
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000054', { chatId })
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(userMessage('0192d4e0-7b3a-7c00-8000-000000000053', { chatId }))
      yield* messages.insert(queued)

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectActiveByChat(chatId),
        Option.some(queued),
      )

      const completed = yield* completeMessage(queued, { text: 'Hello', at: at(1) })
      yield* messages.update(completed, { stage: 'queued' })

      assert.deepStrictEqual(yield* messages.selectActiveByChat(chatId), Option.none())
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("selects the assistant's message as active, never a user one in an active stage", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000043')
      const question = userMessage('0192d4e0-7b3a-7c00-8000-000000000055', { chatId })
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000056', {
        chatId,
        seconds: 1,
      })
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(new Message({ ...question, stage: 'generating' }))
      yield* messages.insert(queued)

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectActiveByChat(chatId),
        Option.some(queued),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('insert refuses a second active reply in a chat and keeps the first', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000044')
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000056', { chatId })
      const second = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000057', {
        chatId,
        seconds: 1,
      })
      yield* insertOwnedChats(userId, [chatId])

      const inserted = yield* messages.insert(queued)
      const refused = yield* messages.insert(second)

      assert.deepStrictEqual([inserted, refused], [true, false])
      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [queued])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('insert accepts a completed reply beside an active one', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000045')
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000058', { chatId })
      const completed = yield* completeMessage(
        assistantMessage('0192d4e0-7b3a-7c00-8000-000000000059', { chatId, seconds: 1 }),
        { text: 'Hello', at: at(2) },
      )
      yield* insertOwnedChats(userId, [chatId])

      const inserted = yield* Effect.forEach([queued, completed], messages.insert)

      assert.deepStrictEqual(inserted, [true, true])
      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [queued, completed])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update from a stage the message has left answers false and changes nothing', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000049')
      const preparing = yield* prepareMessage(
        assistantMessage('0192d4e0-7b3a-7c00-8000-00000000005b', { chatId }),
        at(1),
      )
      const generating = yield* generateMessage(preparing, at(2))
      const completed = yield* completeMessage(generating, { text: 'Hello', at: at(3) })
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(generating)

      const updated = yield* messages.update(completed, { stage: 'preparing' })

      assert.isFalse(updated)
      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectById(generating.id),
        Option.some(generating),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update rewrites a message in place and never creates one', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000046')
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000059', { chatId })
      const unknown = assistantMessage('0192d4e0-7b3a-7c00-8000-00000000005a', { chatId })
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(queued)
      const completed = yield* completeMessage(queued, { text: 'Hello', at: at(1) })

      const updated = yield* Effect.forEach([completed, unknown], (each) =>
        messages.update(each, { stage: 'queued' }),
      )

      assert.deepStrictEqual(updated, [true, false])
      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [completed])
      assert.deepStrictEqual(yield* messages.selectById(unknown.id), Option.none())
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('selects the active message among the terminal ones, wherever it stands', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000048')
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000060', { chatId })
      const preparing = yield* prepareMessage(queued, at(1))
      const generating = yield* generateMessage(preparing, at(2))
      const failed = yield* failMessage(
        assistantMessage('0192d4e0-7b3a-7c00-8000-000000000061', { chatId, seconds: 3 }),
        { reason: 'ReplyFailed', cause: 'provider timeout after 30s', at: at(4) },
      )
      const completed = yield* completeMessage(
        assistantMessage('0192d4e0-7b3a-7c00-8000-000000000062', { chatId, seconds: 5 }),
        { text: 'Hello', at: at(6) },
      )
      yield* insertOwnedChats(userId, [chatId])
      yield* Effect.forEach([generating, failed, completed], messages.insert)

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectActiveByChat(chatId),
        Option.some(generating),
      )
      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [
        generating,
        failed,
        completed,
      ])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('reads a message back with its attachments in upload order, not the order sent', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000047')
      const firstUploaded = attachment('0192d4e0-7b3a-7c00-8000-000000000023', 0)
      const secondUploaded = attachment('0192d4e0-7b3a-7c00-8000-000000000021', 1)
      const question = userMessage('0192d4e0-7b3a-7c00-8000-00000000005c', {
        chatId,
        attachmentIds: [secondUploaded.id, firstUploaded.id],
        seconds: 3,
      })
      const inUploadOrder = new Message({
        ...question,
        attachmentIds: [firstUploaded.id, secondUploaded.id],
      })
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(question)
      yield* bindAttachments([secondUploaded, firstUploaded], question)

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectById(question.id),
        Option.some(inUploadOrder),
      )
      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [inUploadOrder])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
