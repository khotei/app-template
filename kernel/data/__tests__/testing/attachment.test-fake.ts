import {
  Array as Arr,
  Context,
  Effect,
  flow,
  HashMap,
  identity,
  Layer,
  Option,
  Predicate,
  pipe,
  Ref,
  Schema,
  UndefinedOr,
} from 'effect'
import { constTrue } from 'effect/Function'

import { hasRowPer, orDieUnless } from '@app-template/packages/db'

import {
  AttachmentEntity,
  type AttachmentEntitySelectWhere,
} from '#kernel/data/attachment/attachment.entity'
import { AttachmentRepository } from '#kernel/data/attachment/attachment.repository'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import {
  deleteRows,
  inCreationOrderWhere,
  insertRow,
  matches,
  matchesAny,
  updateRows,
  writeSet,
} from '#testing/data/rows.test-util'

/** The rows `AttachmentRepositoryTest` keeps, by id, for a test to arrange or read. */
export class AttachmentRows extends Context.Service<
  AttachmentRows,
  Ref.Ref<HashMap.HashMap<string, AttachmentEntity>>
>()('@app-template/kernel/data/testing/AttachmentRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<string, AttachmentEntity>()))
}

const holdsWhere = ({ id, ...fields }: AttachmentEntitySelectWhere) =>
  Predicate.and(
    matchesAny<AttachmentEntity>({ id: UndefinedOr.map(id, Arr.ensure) }),
    matches<AttachmentEntity>(fields),
  )

const decodeAttachment = Schema.decodeUnknownEffect(AttachmentEntity)

/** The column defaults Postgres fills on an insert that leaves them out. */
const attachmentDefaults = { messageId: null, chatId: null, sourceId: null } as const

const isUnbound = matches<AttachmentEntity>({ messageId: null, chatId: null })

/** Holds while every row that names a source is bound and the rows hold that source. */
const keepsSources = (rows: HashMap.HashMap<string, AttachmentEntity>) =>
  HashMap.every(rows, (row) =>
    pipe(
      Option.fromNullOr(row.sourceId),
      Option.match({
        onNone: constTrue,
        onSome: (sourceId) => Predicate.isNotNull(row.messageId) && HashMap.has(rows, sourceId),
      }),
    ),
  )

/**
 * Requires the id and the timestamp every caller passes, where Postgres would default the id,
 * and fills the binding with nulls. Copies the guards the repository's e2e proves: the primary
 * key, the where fields, the set fields, and on an update `attachments_message_id_chat_id_check`
 * with `attachments_message_id_chat_id_fk`: a row stays unbound, or binds to a message of that
 * chat, read through the `MessageRepository` in context; and on an insert and a delete
 * `attachments_source_id_message_id_check` with `attachments_source_id_fk` (`keepsSources`).
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

    const selectMany = (where: AttachmentEntitySelectWhere) =>
      Ref.get(rows).pipe(Effect.map((all) => inCreationOrderWhere(all, holdsWhere(where))))

    return AttachmentRepository.of({
      insert: (attachment) =>
        decodeAttachment({ ...attachmentDefaults, ...attachment }).pipe(
          Effect.orDie,
          Effect.flatMap((row) => insertRow(rows, { row, accepts: keepsSources })),
          orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no attachment was inserted'),
        ),
      update: (set, where) => {
        const update = writeSet({ messageId: true, chatId: true }, set)
        // Refused before it writes: in Postgres the die rolls back the caller's transaction,
        // which `TransactionTest` cannot.
        return Ref.get(rows).pipe(
          Effect.map(flow(HashMap.filter(holdsWhere(where)), HashMap.toValues, Arr.map(update))),
          Effect.flatMap((written) =>
            Effect.forEach(written, isBindable).pipe(
              Effect.map((bindable) =>
                Arr.every(bindable, identity) ? written : Arr.empty<AttachmentEntity>(),
              ),
            ),
          ),
          orDieUnless(hasRowPer(where.id), 'an attachment named was not updated'),
          Effect.andThen(updateRows(rows, { where: holdsWhere(where), update })),
          Effect.asVoid,
        )
      },
      selectOne: (where) => selectMany(where).pipe(Effect.map(Arr.head)),
      selectMany,
      // Deletes before it dies: outside a transaction, Postgres keeps the rows the statement
      // removed although another id named none. A source still named fails the statement whole.
      delete: (where) =>
        Ref.get(rows).pipe(
          Effect.map(HashMap.filter(Predicate.not(holdsWhere(where)))),
          Effect.filterOrElse(keepsSources, () =>
            Effect.die(new Error('an attachment named is still a source')),
          ),
          Effect.andThen(deleteRows(rows, holdsWhere(where))),
          orDieUnless(hasRowPer(where.id), 'an attachment named was not deleted'),
          Effect.asVoid,
        ),
    })
  }),
)
