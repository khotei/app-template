import type { ExampleId } from '@oblik/domain/example'

export const exampleJobType = 'example.process' as const

export interface ExampleJob {
  readonly type: typeof exampleJobType
  readonly exampleId: ExampleId
}

export interface ExampleQueue {
  send(job: ExampleJob): Promise<void>
  receive(): Promise<readonly ExampleJob[]>
}

export const createExampleQueue = (): ExampleQueue => {
  const pending: ExampleJob[] = []
  return {
    async send(job) {
      pending.push(job)
    },
    async receive() {
      return pending.splice(0)
    },
  }
}
