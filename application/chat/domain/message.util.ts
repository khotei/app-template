import { pipe, String as Str } from 'effect'

import { SchemaId } from '@app-template/packages/schema'

export const MessageId = SchemaId.build('MessageId')
export type MessageId = typeof MessageId.Type

/** A text Postgres can store: no NUL character. */
export const textPattern = /^[^\0]*$/u

export const isBlank = (text: string) => pipe(text, Str.trim, Str.isEmpty)
