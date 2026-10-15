import type { ExampleId } from '@oblik/domain/example'
import type { StorageClient } from '@oblik/storage'

export interface ExampleStorage {
  readonly bucket: string
  buildObjectKey(id: ExampleId): string
}

export const createExampleStorage = (client: StorageClient): ExampleStorage => ({
  bucket: client.bucket,
  buildObjectKey: (id) => `examples/${id}`,
})
