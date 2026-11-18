import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { Chat, ChatFields } from '#chat/domain/chat.model'

/** Encodes a chat's own fields as its row; its attachments and Run are read, never written. */
export const encodeChat = encodeRowWith(ChatFields)

export const decodeChat = decodeOptionalWith(Chat)

export const decodeChats = decodeManyWith(Chat)
