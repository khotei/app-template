import { Schema } from 'effect'

export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string
  readonly schema: S
}

/** A queue message's body, as its definition's schema codes it. */
export class QueueMessage {
  /** The codec of a definition's message body: its schema's JSON form, as a string. */
  static readonly buildCodec = <S extends Schema.Top>(definition: QueueDefinition<S>) =>
    Schema.fromJsonString(Schema.toCodecJson(definition.schema))
}
