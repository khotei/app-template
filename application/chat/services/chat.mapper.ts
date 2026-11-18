import { Schema } from 'effect'

import { decodeRowWith, encodeRowWith } from '@app-template/packages/db'

import { Chat, ChatFields } from '#chat/domain/chat.model'

/** Encodes a chat's own fields as its row; its attachments and Run are read, never written. */
export const encodeChat = encodeRowWith(ChatFields)

export const decodeChat = decodeRowWith(Schema.Option(Chat))

export const decodeChats = decodeRowWith(Schema.Array(Chat))
