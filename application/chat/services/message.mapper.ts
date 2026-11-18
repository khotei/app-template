import { Schema } from 'effect'

import { decodeRowWith, encodeRowWith } from '@app-template/packages/db'

import { Message, MessageFields } from '#chat/domain/message.model'

/** Encodes a message's own fields as its row; its attachments and Run are read, never written. */
export const encodeMessage = encodeRowWith(MessageFields)

export const decodeMessage = decodeRowWith(Schema.Option(Message))

export const decodeMessages = decodeRowWith(Schema.Array(Message))
