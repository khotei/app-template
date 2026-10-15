import type { ExampleId } from '@oblik/domain/example'
import type { QueueClient } from '@oblik/queue'

export const exampleJobType = 'example.process' as const

export interface ExampleJob {
  readonly type: typeof exampleJobType
  readonly exampleId: ExampleId
}

export interface ExampleQueue {
  readonly url: string
}

export const createExampleQueue = (client: QueueClient): ExampleQueue => ({ url: client.url })
