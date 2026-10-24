import { Array as Arr, Order } from 'effect'

/**
 * Sorts items by id, to compare a set in a fixed order or to match a store that breaks ties by
 * id.
 */
export const sortById = <A extends { readonly id: string }>(items: ReadonlyArray<A>) =>
  Arr.sortWith(items, (item) => item.id, Order.String)
