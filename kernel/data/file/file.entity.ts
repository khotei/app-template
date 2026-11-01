import type { Stream } from 'effect'

/** The object tag the bucket's expiration rule selects on: a file no row binds yet. */
export const unboundTag = { key: 'unbound', value: 'true' } as const

export const buildFileKey = (id: string): string => `attachments/${id}`

export interface FileEntity {
  readonly id: string
  readonly mediaType: string
  readonly fileName: string
}

export interface FileEntityInsert<E> extends FileEntity {
  readonly content: Stream.Stream<Uint8Array, E>
}

export type FileEntityWhere = Pick<FileEntity, 'id'>

export interface FileEntityDeleteWhere {
  readonly id: ReadonlyArray<string>
}

/**
 * Stored as the absence of `unboundTag`, so a bound file never expires; a file is bound once and
 * stays so, since the store cannot tag it back.
 */
export interface FileEntitySet {
  readonly bound: true
}
