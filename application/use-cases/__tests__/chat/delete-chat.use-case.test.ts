import { assert, describe, it } from '@effect/vitest'
import { Effect, Exit, Option, Stream } from 'effect'

import {
  Attachment,
  AttachmentId,
  buildAttachment,
  Chat,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/application/chat'
import { chat, firstMessage, layerChatTest, owner } from '@app-template/application/chat/testing'
import { type ChatEntityWhere, FileRepository } from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { epoch, png } from '@app-template/packages/testing'

import { deleteChat } from '#use-cases/chat/delete-chat.use-case'

const photo = { fileName: FileName.make('photo.png'), mediaType: MediaType.make('image/png') }

/** An attachment of `owner` in the library. */
const inLibrary = buildAttachment({
  ...photo,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
  userId: owner,
  size: FileSize.make(png.length),
  createdAt: epoch,
})

/** An upload sent with `firstMessage`, its bytes its own. */
const upload = new Attachment({
  ...inLibrary,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000026'),
  messageId: Option.some(firstMessage.id),
  chatId: Option.some(chat.id),
})

/** `chat`'s record of `inLibrary`, sent with `firstMessage`; its bytes are its source's. */
const record = new Attachment({
  ...upload,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000025'),
  sourceId: Option.some(inLibrary.id),
})

const withAttachments = new Chat({ ...chat, attachments: [upload, record] })

const storeBytes = (id: AttachmentId) =>
  FileRepository.use((files) => files.insert({ ...photo, id, content: Stream.make(png) }))

const hasBytes = (id: AttachmentId) =>
  FileRepository.use((files) => files.selectOne({ id })).pipe(Effect.map(Option.isSome))

const selectsChat = () => encodeRowWith(Chat)(withAttachments).pipe(Effect.map(Option.some))

describe('deleteChat', () => {
  it.effect(
    "deletes the owner's chat, then its upload's bytes, keeping a record's source in the library",
    () => {
      const deleted: Array<ChatEntityWhere> = []
      return Effect.gen(function* () {
        yield* storeBytes(upload.id)
        yield* storeBytes(inLibrary.id)

        yield* deleteChat(owner, chat.id)

        assert.deepStrictEqual(deleted, [{ id: chat.id }])
        assert.isFalse(yield* hasBytes(upload.id))
        assert.isTrue(yield* hasBytes(inLibrary.id))
      }).pipe(
        Effect.provide(
          layerChatTest({
            chats: {
              selectOne: selectsChat,
              delete: (where) =>
                Effect.sync(() => {
                  deleted.push(where)
                }),
            },
          }),
        ),
      )
    },
  )

  it.effect('a chat whose rows delete dies keeps the bytes', () =>
    Effect.gen(function* () {
      yield* storeBytes(upload.id)

      const exit = yield* deleteChat(owner, chat.id).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assert.isTrue(yield* hasBytes(upload.id))
    }).pipe(
      Effect.provide(
        layerChatTest({
          chats: { selectOne: selectsChat, delete: () => Effect.die('the chat was gone') },
        }),
      ),
    ),
  )
})
