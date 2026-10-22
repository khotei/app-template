import { Data, Stream } from 'effect'

export class StreamBrokenError extends Data.TaggedError('StreamBrokenError') {}

/** Emits `values`, then fails with `error`. */
export const breakAfter = <A>(values: ReadonlyArray<A>, error: StreamBrokenError) =>
  Stream.concat(Stream.fromArray(values), Stream.fail(error))
