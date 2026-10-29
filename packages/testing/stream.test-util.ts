import { Data, Stream } from 'effect'

export class StreamBrokenError extends Data.TaggedError('StreamBrokenError') {}

export const breakAfter = <A>(values: ReadonlyArray<A>, error: StreamBrokenError) =>
  Stream.fromArray(values).pipe(Stream.concat(Stream.fail(error)))
