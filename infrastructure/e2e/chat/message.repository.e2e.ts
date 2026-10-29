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
import { assertSchemaEquals, sortById } from '@app-template/testing'

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

const SelectedMessage = Schema.Option(Message)

const ActiveMessages = Schema.Array(Message)

const Detail = Schema.Struct({ message: Message, attachments: Schema.Array(Attachment) })

const Details = Schema.Array(Detail)

/** Uploads the attachments, then binds them to the message, as a send does. */
const bindAttachments = (attachments: ReadonlyArray<Attachment>, message: Message) =>
  Effect.gen(function* () {
    const repository = yield* AttachmentRepository

    yield* Effect.forEach(attachments, repository.insert, { discard: true })
    yield* repository.update(
      { messageId: Option.some(message.id) },
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

      assertSchemaEquals(Details, yield* messages.selectByChat(chatId), [
        { message: question, attachments: [] },
        { message: reply, attachments: [] },
      ])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect(
    "selectOne and selectDetail read another chat's message or a stranger's chat's as none",
    () =>
      Effect.gen(function* () {
        const messages = yield* MessageRepository
        const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004c')
        const other = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004d')
        const strangerId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
        const question = userMessage('0192d4e0-7b3a-7c00-8000-00000000005e', { chatId })
        yield* insertOwnedChats(userId, [chatId, other])
        yield* messages.insert(question)

        const owned = yield* messages.selectOne({ id: question.id, chatId, userId })
        const ownedDetail = yield* messages.selectDetail({ id: question.id, chatId, userId })
        const elsewhere = yield* messages.selectOne({ id: question.id, chatId: other })
        const foreign = yield* messages.selectOne({ id: question.id, userId: strangerId })
        const foreignDetail = yield* messages.selectDetail({ id: question.id, userId: strangerId })

        assertSchemaEquals(SelectedMessage, owned, Option.some(question))
        assertSchemaEquals(
          Schema.Option(Detail),
          ownedDetail,
          Option.some({ message: question, attachments: [] }),
        )
        assert.deepStrictEqual(
          [elsewhere, foreign, foreignDetail],
          [Option.none(), Option.none(), Option.none()],
        )
      }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('existsByChat answers whether the chat has a message', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004a')
      const empty = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004b')
      yield* insertOwnedChats(userId, [chatId, empty])
      yield* messages.insert(userMessage('0192d4e0-7b3a-7c00-8000-00000000005d', { chatId }))

      assert.deepStrictEqual(
        [yield* messages.existsByChat(chatId), yield* messages.existsByChat(empty)],
        [true, false],
      )
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

      assertSchemaEquals(ActiveMessages, yield* messages.selectActive([chatId]), [queued])

      const completed = yield* completeMessage(queued, { text: 'Hello', at: at(1) })
      yield* messages.update(completed, { stage: 'queued' })

      assert.deepStrictEqual(yield* messages.selectActive([chatId]), [])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('selectActive answers the active message of each chat asked, none for the others', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const queuedIn = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004c')
      const generatingIn = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004d')
      const settled = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004e')
      const notAsked = ChatId.make('0192d4e0-7b3a-7c00-8000-00000000004f')
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000063', { chatId: queuedIn })
      const preparing = yield* prepareMessage(
        assistantMessage('0192d4e0-7b3a-7c00-8000-000000000064', { chatId: generatingIn }),
        at(1),
      )
      const generating = yield* generateMessage(preparing, at(2))
      const completed = yield* completeMessage(
        assistantMessage('0192d4e0-7b3a-7c00-8000-000000000065', { chatId: settled }),
        { text: 'Hello', at: at(1) },
      )
      yield* insertOwnedChats(userId, [queuedIn, generatingIn, settled, notAsked])
      yield* Effect.forEach(
        [
          queued,
          generating,
          completed,
          assistantMessage('0192d4e0-7b3a-7c00-8000-000000000066', { chatId: notAsked }),
        ],
        messages.insert,
      )

      const active = yield* messages.selectActive([queuedIn, generatingIn, settled])

      assertSchemaEquals(ActiveMessages, sortById(active), sortById([queued, generating]))
      assert.deepStrictEqual(yield* messages.selectActive([]), [])
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

      assertSchemaEquals(ActiveMessages, yield* messages.selectActive([chatId]), [queued])
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
      assertSchemaEquals(Details, yield* messages.selectByChat(chatId), [
        { message: queued, attachments: [] },
      ])
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

      assertSchemaEquals(Details, yield* messages.selectByChat(chatId), [
        { message: queued, attachments: [] },
        { message: completed, attachments: [] },
      ])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update from a stage the message has left dies and changes nothing', () =>
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

      const exit = yield* messages.update(completed, { stage: 'preparing' }).pipe(Effect.exit)

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

      yield* messages.update(completed, { stage: 'queued' })
      const exit = yield* messages.update(unknown, { stage: 'queued' }).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(Details, yield* messages.selectByChat(chatId), [
        { message: completed, attachments: [] },
      ])
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

      assertSchemaEquals(ActiveMessages, yield* messages.selectActive([chatId]), [generating])
      assertSchemaEquals(Details, yield* messages.selectByChat(chatId), [
        { message: generating, attachments: [] },
        { message: failed, attachments: [] },
        { message: completed, attachments: [] },
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
        new Attachment({ ...each, messageId: Option.some(question.id) })
      const inUploadOrder = {
        message: question,
        attachments: [bound(firstUploaded), bound(secondUploaded)],
      }
      yield* insertOwnedChats(userId, [chatId])
      yield* messages.insert(question)
      yield* bindAttachments([secondUploaded, firstUploaded], question)

      assertSchemaEquals(
        Schema.Option(Detail),
        yield* messages.selectDetail({ id: question.id }),
        Option.some(inUploadOrder),
      )
      assertSchemaEquals(Details, yield* messages.selectByChat(chatId), [inUploadOrder])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
