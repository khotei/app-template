import {
  Array as Arr,
  Context,
  Effect,
  Filter,
  flow,
  HashMap,
  identity,
  Layer,
  Option,
  Predicate,
  pipe,
  Ref,
  Schema,
} from 'effect'

import {
  deleteRows,
  insertRow,
  matches,
  matchesAny,
  orDieOnNoRows,
  updateRows,
  writeSet,
} from '@app-template/packages/testing'

import {
  AttachmentEntity,
  type AttachmentEntityWhere,
} from '#kernel/data/attachment/attachment.entity'
import { AttachmentRepository } from '#kernel/data/attachment/attachment.repository'
import { MessageRepository } from '#kernel/data/chat/message.repository'

/** The rows `AttachmentRepositoryTest` keeps, by id, for a test to arrange or read. */
export class AttachmentRows extends Context.Service<
  AttachmentRows,
  Ref.Ref<HashMap.HashMap<string, AttachmentEntity>>
>()('@app-template/kernel/data/testing/AttachmentRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<string, AttachmentEntity>()))
}

const holdsWhere = (where: AttachmentEntityWhere) =>
  Predicate.and(
    matchesAny<AttachmentEntity>({ id: Arr.ensure(where.id) }),
    matches<AttachmentEntity>({ userId: where.userId, messageId: where.messageId }),
  )

/** The rows in the order of `ids`, one id or a list. */
const inOrderOf =
  (ids: AttachmentEntityWhere['id']) =>
  (found: HashMap.HashMap<string, AttachmentEntity>): ReadonlyArray<AttachmentEntity> =>
    pipe(
      Arr.ensure(ids),
      Arr.filterMap(Filter.fromPredicateOption((id: string) => HashMap.get(found, id))),
    )

const decodeAttachment = Schema.decodeUnknownEffect(AttachmentEntity)

/** The column defaults Postgres fills on an insert that leaves them out. */
const attachmentDefaults = { messageId: null, chatId: null } as const

const isUnbound = matches<AttachmentEntity>({ messageId: null, chatId: null })

/**
 * Requires the id and the timestamp every caller passes, where Postgres would default the id,
 * and fills the binding with nulls. Copies the guards the repository's e2e proves: the primary
 * key, the where fields, the set fields, and on an update `attachments_message_id_chat_id_check`
 * with `attachments_message_id_chat_id_fk`: a row stays unbound, or binds to a message of that
 * chat, read through the `MessageRepository` in context. `forUpdate` locks nothing: one fiber
 * writes at a time.
 */
export const AttachmentRepositoryTest = Layer.effect(
  AttachmentRepository,
  Effect.gen(function* () {
    const rows = yield* AttachmentRows
    const messages = yield* MessageRepository

    const isBindable = (row: AttachmentEntity) =>
      pipe(
        Option.all({ id: Option.fromNullOr(row.messageId), chatId: Option.fromNullOr(row.chatId) }),
        Option.match({
          onNone: () => Effect.succeed(isUnbound(row)),
          onSome: (message) => messages.selectOne(message).pipe(Effect.map(Option.isSome)),
        }),
      )

    const selectMany = (where: AttachmentEntityWhere) =>
      Ref.get(rows).pipe(
        Effect.map(HashMap.filter(holdsWhere(where))),
        Effect.map(inOrderOf(where.id)),
      )

    return AttachmentRepository.of({
      insert: (attachment) =>
        decodeAttachment({ ...attachmentDefaults, ...attachment }).pipe(
          Effect.orDie,
          Effect.flatMap((row) => insertRow(rows, { row })),
          orDieOnNoRows('no attachment was inserted: its id is taken'),
        ),
      update: (set, where) => {
        const update = writeSet({ messageId: true, chatId: true }, set)
        return Ref.get(rows).pipe(
          Effect.map(flow(HashMap.filter(holdsWhere(where)), HashMap.toValues, Arr.map(update))),
          Effect.flatMap((written) => Effect.forEach(written, isBindable)),
          Effect.flatMap((bindable) =>
            Arr.every(bindable, identity)
              ? updateRows(rows, { where: holdsWhere(where), update })
              : Effect.succeed(Arr.empty<AttachmentEntity>()),
          ),
          orDieOnNoRows('no attachment was updated'),
        )
      },
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
      delete: (where) =>
        deleteRows(rows, holdsWhere(where)).pipe(orDieOnNoRows('no attachment was deleted')),
    })
  }),
)
