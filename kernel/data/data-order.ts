/** The orders a read sorts rows by, on the `createdAt` and `id` every table holds. */
export class RowOrder {
  static readonly newestFirst = { createdAt: 'desc', id: 'desc' } as const

  static readonly inCreationOrder = { createdAt: 'asc', id: 'asc' } as const
}
