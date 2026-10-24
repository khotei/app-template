import { Array as Arr, Order } from 'effect'

/**
 * Sorts by id, to compare as a set what shares a `createdAt` (a send's two messages, one
 * request's uploads): the store leaves their relative order open.
 */
export const sortById = <A extends { readonly id: string }>(items: ReadonlyArray<A>) =>
  Arr.sortWith(items, (item) => item.id, Order.String)
