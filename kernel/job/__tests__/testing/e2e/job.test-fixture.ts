import { Schema } from 'effect'

import { resources } from '@app-template/kernel/aws'
import type { QueueDefinition } from '@app-template/packages/queue'

const { assistantMessage } = resources.queues

/** A job shaped as a reply's, since the kernel knows no module's jobs. */
export class SampleJob extends Schema.Class<SampleJob>('SampleJob')({
  chatId: Schema.String,
  messageId: Schema.String,
  provenance: Schema.Struct({
    provider: Schema.String,
    model: Schema.String,
    instructionsHash: Schema.String,
  }),
}) {}

/** On a queue every stage provisions, so a sender can send to its real queue. */
export const sampleJobQueue = {
  name: assistantMessage.name,
  schema: SampleJob,
} satisfies QueueDefinition<typeof SampleJob>

export const sampleProvenance = {
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  instructionsHash: 'a1b2c3',
}
