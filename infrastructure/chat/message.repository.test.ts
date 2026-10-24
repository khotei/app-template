import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  Attachment,
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

import {
  insertOwnedChats,
  RepositoryStackKvMemory,
  RepositoryStackPgTest,
  repositoryStacks,
} from '#infrastructure/testing/repository.harness'

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
    const messageId = Option.some(message.id)

    yield* Effect.forEach(attachments, repository.insert, { discard: true })
    yield* Effect.forEach(
      attachments,
      (each) => repository.update(new Attachment({ ...each, messageId })),
      { discard: true },
    )
  })

describe.each(repositoryStacks)('MessageRepository on $name', ({ stack }) => {
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
    }).pipe(Effect.provide(stack)),
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
      yield* messages.update(completed)

      assert.deepStrictEqual(yield* messages.selectActiveByChat(chatId), Option.none())
    }).pipe(Effect.provide(stack)),
  )

  it.effect("selects none as active when the last message is the user's", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000043')
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(userMessage('0192d4e0-7b3a-7c00-8000-000000000055', { chatId }))

      assert.deepStrictEqual(yield* messages.selectActiveByChat(chatId), Option.none())
      assert.deepStrictEqual(
        yield* messages.selectActiveByChat(ChatId.make('0192d4e0-7b3a-7c00-8000-000000000049')),
        Option.none(),
      )
    }).pipe(Effect.provide(stack)),
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
    }).pipe(Effect.provide(stack)),
  )

  it.effect('deleteByChat removes every message of the chat and keeps the others', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000044')
      const other = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000045')
      const deleted = [
        userMessage('0192d4e0-7b3a-7c00-8000-000000000056', { chatId }),
        assistantMessage('0192d4e0-7b3a-7c00-8000-000000000057', { chatId, seconds: 1 }),
      ]
      const kept = userMessage('0192d4e0-7b3a-7c00-8000-000000000058', { chatId: other })
      yield* insertOwnedChats(userId, [chatId, other])
      yield* Effect.forEach(Arr.append(deleted, kept), messages.insert)

      yield* messages.deleteByChat(chatId)

      const afterDelete = yield* Effect.forEach(deleted, (each) => messages.selectById(each.id))
      assert.deepStrictEqual(
        afterDelete,
        Arr.map(deleted, () => Option.none()),
      )
      assert.deepStrictEqual(yield* messages.selectByChat(chatId), [])
      assertSchemaEquals(Messages, yield* messages.selectByChat(other), [kept])
    }).pipe(Effect.provide(stack)),
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

      yield* messages.update(completed)
      yield* messages.update(unknown)

      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [completed])
      assert.deepStrictEqual(yield* messages.selectById(unknown.id), Option.none())
    }).pipe(Effect.provide(stack)),
  )

  it.effect('reads a message back with the attachments bound to it, in upload order', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000047')
      const uploaded = [
        attachment('0192d4e0-7b3a-7c00-8000-000000000022', 0),
        attachment('0192d4e0-7b3a-7c00-8000-000000000021', 1),
      ]
      const question = userMessage('0192d4e0-7b3a-7c00-8000-00000000005b', {
        chatId,
        attachmentIds: Arr.map(uploaded, (each) => each.id),
        seconds: 2,
      })
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(question)
      yield* bindAttachments(uploaded, question)

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectById(question.id),
        Option.some(question),
      )
      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [question])
    }).pipe(Effect.provide(stack)),
  )
})

describe('MessageRepositoryKv', () => {
  it.effect("deleteByChat removes the chat's index, and update leaves it alone", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const store = yield* KeyValueStore.KeyValueStore
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000044')
      const other = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000045')
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000059', { chatId: other })
      const completed = yield* completeMessage(queued, { text: 'Hello', at: at(1) })
      yield* messages.insert(userMessage('0192d4e0-7b3a-7c00-8000-000000000056', { chatId }))
      yield* messages.insert(queued)

      yield* messages.deleteByChat(chatId)
      yield* messages.update(completed)

      assert.isFalse(yield* store.has(`chats/${chatId}/messages`))
      assert.strictEqual(yield* store.get(`chats/${other}/messages`), JSON.stringify([queued.id]))
    }).pipe(Effect.provide(RepositoryStackKvMemory)),
  )

  it.effect('selects messages created in one millisecond in insertion order', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000040')
      const question = userMessage('0192d4e0-7b3a-7c00-8000-000000000052', { chatId })
      const reply = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000051', { chatId })
      yield* messages.insert(question)
      yield* messages.insert(reply)

      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [question, reply])
    }).pipe(Effect.provide(RepositoryStackKvMemory)),
  )
})

describe('MessageRepositoryPg', () => {
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

  it.effect('selects messages created in one millisecond by id', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000040')
      const question = userMessage('0192d4e0-7b3a-7c00-8000-000000000052', { chatId })
      const reply = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000051', { chatId })
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(question)
      yield* messages.insert(reply)

      assertSchemaEquals(Messages, yield* messages.selectByChat(chatId), [reply, question])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('reads attachments in upload order, whatever order the send listed them in', () =>
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
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(question)
      yield* bindAttachments([secondUploaded, firstUploaded], question)

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectById(question.id),
        Option.some(
          new Message({ ...question, attachmentIds: [firstUploaded.id, secondUploaded.id] }),
        ),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
