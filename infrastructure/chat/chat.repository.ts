import { DateTime, Effect, flow, Layer, Option, Schema, Struct } from 'effect'

import { ChatRepository, type ChatSet, type ChatWhere } from '@app-template/domain/chat'
import {
  ChatEntityInsert,
  ChatRepository as ChatEntityRepository,
  type ChatEntitySet,
  type ChatEntityWhere,
} from '@app-template/kernel/data/chat'

import { ChatFromEntity } from '#infrastructure/chat/chat.mapper'

const encodeChat = flow(
  Schema.encodeEffect(ChatFromEntity),
  Effect.flatMap(Schema.decodeEffect(ChatEntityInsert)),
)

// Lambdas, not `Struct.evolve`: evolve maps a key by one function over the whole union, so the
// key a `RequireAtLeastOne` branch requires comes out `| undefined`.
interface GetOrNull extends Struct.Lambda {
  <A>(self: Option.Option<A>): A | null
  readonly '~lambda.out': this['~lambda.in'] extends Option.Option<infer A> | undefined
    ? A | null
    : never
}

interface ToDateUtc extends Struct.Lambda {
  (self: DateTime.Utc): Date
  readonly '~lambda.out': Date
}

const getOrNull = Struct.lambda<GetOrNull>(Option.getOrNull)

const toDateUtc = Struct.lambda<ToDateUtc>(DateTime.toDateUtc)

const encodeSet = (set: ChatSet): ChatEntitySet => {
  const titled = Struct.mapPick(set, ['title'], getOrNull)
  return Struct.mapPick(titled, ['updatedAt'], toDateUtc)
}

const encodeWhere = (where: ChatWhere): ChatEntityWhere =>
  Struct.mapPick(where, ['title'], getOrNull)

const decodeChat = Schema.decodeEffect(Schema.Option(ChatFromEntity))

const decodeChats = Schema.decodeEffect(Schema.Array(ChatFromEntity))

export const ChatRepositoryPg = Layer.effect(
  ChatRepository,
  ChatEntityRepository.useSync((chats) =>
    ChatRepository.of({
      insert: (chat) => encodeChat(chat).pipe(Effect.flatMap(chats.insert), Effect.orDie),
      update: (set, where) => chats.update(encodeSet(set), encodeWhere(where)),
      selectOne: (where) =>
        chats.selectOne(encodeWhere(where)).pipe(Effect.flatMap(decodeChat), Effect.orDie),
      selectMany: (where) =>
        chats.selectMany(where).pipe(Effect.flatMap(decodeChats), Effect.orDie),
      delete: (where) => chats.delete(encodeWhere(where)),
    }),
  ),
).pipe(Layer.provide(ChatEntityRepository.layer))
