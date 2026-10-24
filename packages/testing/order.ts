import { Array as Arr, Order } from 'effect'

/** Sorts by id, to compare as a set items whose stored order is left open. */
export const sortById = <A extends { readonly id: string }>(items: ReadonlyArray<A>) =>
  Arr.sortWith(items, (item) => item.id, Order.String)

export const idsOf = <A extends { readonly id: string }>(items: ReadonlyArray<A>): Array<A['id']> =>
  Arr.map(items, (item) => item.id)
