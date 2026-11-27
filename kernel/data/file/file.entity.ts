import { Option, type Stream } from 'effect'

import type { ObjectHead } from '@app-template/packages/aws/s3'

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

export interface FileEntityDownloadWhere {
  readonly id: string
}

/** What `FileRepository` builds its requests from: a file's object key and its entity. */
export class FileObject {
  static readonly buildKey = (id: string): string => `attachments/${id}`

  /** `insert` always writes the name, so an object without one is a defect. */
  static readonly buildEntity = (
    { contentType, fileName }: ObjectHead,
    { id, url }: { readonly id: string; readonly url: URL },
  ): FileEntity => ({
    id,
    mediaType: contentType,
    fileName: Option.getOrThrowWith(fileName, () => new Error(`file ${id} has no name`)),
    url,
  })
}
