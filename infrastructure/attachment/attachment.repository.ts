import { Effect, flow, Layer, Option, Schema, Struct, UndefinedOr } from 'effect'

import {
  AttachmentRepository,
  type AttachmentSet,
  type AttachmentWhere,
} from '@app-template/chat/domain'
import {
  AttachmentEntityInsert,
  AttachmentRepository as AttachmentEntityRepository,
  type AttachmentEntitySet,
  type AttachmentEntityWhere,
} from '@app-template/kernel/data/attachment'

import { AttachmentFromEntity } from '#infrastructure/attachment/attachment.mapper'

const encodeAttachment = flow(
  Schema.encodeEffect(AttachmentFromEntity),
  Effect.flatMap(Schema.decodeEffect(AttachmentEntityInsert)),
  Effect.orDie,
)

const decodeAttachment = flow(
  Schema.decodeEffect(Schema.Option(AttachmentFromEntity)),
  Effect.orDie,
)

const decodeAttachments = flow(
  Schema.decodeEffect(Schema.Array(AttachmentFromEntity)),
  Effect.orDie,
)

// A lambda, not `Struct.evolve` with `UndefinedOr.map`: evolve maps a key by one function over
// the whole union, so the key a `RequireAtLeastOne` branch requires comes out `| undefined`.
interface GetOrNull extends Struct.Lambda {
  <A>(self: Option.Option<A> | undefined): A | null | undefined
  readonly '~lambda.out': this['~lambda.in'] extends Option.Option<infer A> | undefined
    ? A | null
    : never
}

const getOrNull = Struct.lambda<GetOrNull>(UndefinedOr.map(Option.getOrNull))

const encodeSet = (set: AttachmentSet): AttachmentEntitySet =>
  Struct.mapPick(set, ['messageId', 'chatId'], getOrNull)

const encodeWhere = (where: AttachmentWhere): AttachmentEntityWhere =>
  Struct.evolve(where, { messageId: UndefinedOr.map(Option.getOrNull) })

export const AttachmentRepositoryPg = Layer.effect(
  AttachmentRepository,
  AttachmentEntityRepository.useSync((attachments) =>
    AttachmentRepository.of({
      insert: (attachment) => encodeAttachment(attachment).pipe(Effect.flatMap(attachments.insert)),
      update: (set, where) => attachments.update(encodeSet(set), encodeWhere(where)),
      selectOne: (where) =>
        attachments.selectOne(encodeWhere(where)).pipe(Effect.flatMap(decodeAttachment)),
      selectMany: (where, options) =>
        attachments.selectMany(encodeWhere(where), options).pipe(Effect.flatMap(decodeAttachments)),
      delete: (where) => attachments.delete(encodeWhere(where)),
    }),
  ),
).pipe(Layer.provide(AttachmentEntityRepository.layer))
