import { decodeManyWith, decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { Message, MessageFields } from '#chat/domain/message.model'

/** Encodes a message's own fields as its row; its attachments and Run are read, never written. */
export const encodeMessage = encodeRowWith(MessageFields)

export const decodeMessage = decodeOptionalWith(Message)

export const decodeMessages = decodeManyWith(Message)
