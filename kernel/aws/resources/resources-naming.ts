/** How this app names its AWS resources: by project, stage and the inventory's name. */
export class ResourceName {
  static readonly project = 'app-template' as const

  static readonly build = (stage: string, resource: string): string =>
    `${ResourceName.project}-${stage}-${resource}`

  /** A queue's dead-letter queue, named from the queue's own physical name. */
  static readonly buildDeadLetter = (queue: string): string => `${queue}-dlq`
}
