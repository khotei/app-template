export interface QueueClientOptions {
  readonly url: string
}

export interface QueueClient {
  readonly url: string
}

export const createQueueClient = (options: QueueClientOptions): QueueClient => ({
  url: options.url,
})
