import type { Stream } from 'effect'

export const buildFileKey = (id: string): string => `attachments/${id}`

export interface FileEntity {
  readonly id: string
  readonly mediaType: string
  readonly fileName: string
  /** A GET that serves the bytes with the stored media type and an inline disposition, signed at the read. */
  readonly url: URL
}

export interface FileEntityInsert<E> extends Omit<FileEntity, 'url'> {
  readonly content: Stream.Stream<Uint8Array, E>
}

export interface DownloadedFileEntity extends FileEntity {
  readonly blob: Uint8Array
}

export interface FileEntityWhere {
  readonly id: string | ReadonlyArray<string>
}
