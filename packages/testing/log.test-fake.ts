import { Array as Arr, Cause, Logger, Option, References } from 'effect'

/** A recorded log line: `[level, message, ...annotations, error?]`. */
export type LogLine = ReadonlyArray<unknown>

/**
 * Records each log line as its level, its first message part, the values of the named
 * annotations, then the error its cause fails with, if any, so a test asserts the level with the
 * message.
 */
export function recordLogs(...annotations: ReadonlyArray<string>) {
  const logs: Array<LogLine> = []
  const logger = Logger.make<unknown, void>(({ logLevel, message, cause, fiber }) => {
    const first = Array.isArray(message) ? message[0] : message
    const values = fiber.getRef(References.CurrentLogAnnotations)
    logs.push([
      logLevel,
      first,
      ...Arr.map(annotations, (key) => values[key]),
      ...Option.toArray(Cause.findErrorOption(cause)),
    ])
  })
  return { logs, layer: Logger.layer([logger]) }
}
