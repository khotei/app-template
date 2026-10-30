import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Exit, Option, Schema } from 'effect'

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
  ActiveMessageStatus,
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
  RepositoryStackPgTest,
} from '#infrastructure/testing/repository-stack.test-layer'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const at = (seconds: number) => DateTime.add(createdAt, { seconds })

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')

const userMessage = (id: string, { chatId, seconds = 0 }: { chatId: ChatId; seconds?: number }) =>
  buildUserMessage({ id: MessageId.make(id), chatId, text: 'Hi', createdAt: at(seconds) })

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

const Messages = Schema.Array(Message)

const SelectedMessage = Schema.Option(Message)

/** Uploads the attachments, then binds them to the message, as a send does. */
const bindAttachments = (attachments: ReadonlyArray<Attachment>, message: Message) =>
  Effect.gen(function* () {
    const repository = yield* AttachmentRepository

    yield* Effect.forEach(attachments, repository.insert, { discard: true })
    yield* repository.update(
      { messageId: Option.some(message.id), chatId: Option.some(message.chatId) },
      { id: Arr.map(attachments, (each) => each.id) },
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

      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [question, reply])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("selectOne reads another chat's message or a stranger's chat's as none", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004c')
      const other = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004d')
      const strangerId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
      const question = userMessage('0192d4e0-7b3a-7c00-8000-00000000005e', { chatId })
      yield* insertOwnedChats(userId, [chatId, other])
      yield* messages.insert(question)

      const owned = yield* messages.selectOne({ id: question.id, chatId, userId })
      const elsewhere = yield* messages.selectOne({ id: question.id, chatId: other })
      const foreign = yield* messages.selectOne({ id: question.id, userId: strangerId })

      assertSchemaEquals(SelectedMessage, owned, Option.some(question))
      assert.deepStrictEqual([elsewhere, foreign], [Option.none(), Option.none()])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("selectOne by chatId reads the chat's first message, none for an empty chat", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004a')
      const empty = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004b')
      const first = userMessage('0192d4e0-7b3a-7c00-8000-00000000005f', { chatId })
      yield* insertOwnedChats(userId, [chatId, empty])
      yield* messages.insert(
        userMessage('0192d4e0-7b3a-7c00-8000-00000000005d', { chatId, seconds: 1 }),
      )
      yield* messages.insert(first)

      assertSchemaEquals(SelectedMessage, yield* messages.selectOne({ chatId }), Option.some(first))
      assert.deepStrictEqual(yield* messages.selectOne({ chatId: empty }), Option.none())
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
        Messages,
        yield* messages.selectMany({ chatId, status: ActiveMessageStatus.literals }),
        [queued],
      )

      const completed = yield* completeMessage(queued, { text: 'Hello', at: at(1) })
      yield* messages.update(completed, { status: 'queued' })

      assert.deepStrictEqual(
        yield* messages.selectMany({ chatId, status: ActiveMessageStatus.literals }),
        [],
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

      yield* messages.insert(queued)
      const exit = yield* messages.insert(second).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [queued])
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

      yield* Effect.forEach([queued, completed], messages.insert)

      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [queued, completed])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update from a status the message has left dies and changes nothing', () =>
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

      const exit = yield* messages.update(completed, { status: 'preparing' }).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectOne({ id: generating.id }),
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

      yield* messages.update(completed, { status: 'queued' })
      const exit = yield* messages.update(unknown, { status: 'queued' }).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [completed])
      assert.deepStrictEqual(yield* messages.selectOne({ id: unknown.id }), Option.none())
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
        Messages,
        yield* messages.selectMany({ chatId, status: ActiveMessageStatus.literals }),
        [generating],
      )
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [
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
      const question = userMessage('0192d4e0-7b3a-7c00-8000-00000000005c', { chatId, seconds: 3 })
      const bound = (each: Attachment) =>
        new Attachment({
          ...each,
          messageId: Option.some(question.id),
          chatId: Option.some(chatId),
        })
      const inUploadOrder = new Message({
        ...question,
        attachments: [bound(firstUploaded), bound(secondUploaded)],
      })
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(question)
      yield* bindAttachments([secondUploaded, firstUploaded], question)

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectOne({ id: question.id }),
        Option.some(inUploadOrder),
      )
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [inUploadOrder])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
