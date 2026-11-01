import { Effect, flow, Layer, Schema } from 'effect'

import { MessageRepository } from '@app-template/domain/chat'
import {
  MessageEntityInsert,
  MessageRepository as MessageEntityRepository,
} from '@app-template/kernel/data/chat'

import { MessageFromEntity } from '#infrastructure/chat/chat.mapper'

const encodeMessage = flow(
  Schema.encodeEffect(MessageFromEntity),
  Effect.flatMap(Schema.decodeEffect(MessageEntityInsert)),
)

const decodeMessage = Schema.decodeEffect(Schema.Option(MessageFromEntity))

const decodeMessages = Schema.decodeEffect(Schema.Array(MessageFromEntity))

export const MessageRepositoryPg = Layer.effect(
  MessageRepository,
  MessageEntityRepository.useSync((messages) =>
    MessageRepository.of({
      insert: (message) =>
        encodeMessage(message).pipe(Effect.flatMap(messages.insert), Effect.orDie),
      update: (message, where) =>
        encodeMessage(message).pipe(
          Effect.flatMap((row) => messages.update(row, { id: message.id, status: [where.status] })),
          Effect.orDie,
        ),
      selectOne: (where) =>
        messages.selectOne(where).pipe(Effect.flatMap(decodeMessage), Effect.orDie),
      selectMany: (where) =>
        messages.selectMany(where).pipe(Effect.flatMap(decodeMessages), Effect.orDie),
    }),
  ),
).pipe(Layer.provide(MessageEntityRepository.layer))
