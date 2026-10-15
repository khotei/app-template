export interface StorageClientOptions {
  readonly endpoint: string
  readonly bucket: string
}

export interface StorageClient {
  readonly bucket: string
}

export const createStorageClient = (options: StorageClientOptions): StorageClient => ({
  bucket: options.bucket,
})
