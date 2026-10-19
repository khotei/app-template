import { Array as Arr, Logger, References } from 'effect'

/** A recorded log line: `[level, message, ...annotations]`. */
export type LogLine = ReadonlyArray<unknown>

/**
 * Records each log line as its level, its first message part, then the values of the named
 * annotations, so a test asserts the level with the message.
 */
export const recordLogs = (...annotations: ReadonlyArray<string>) => {
  const logs: Array<LogLine> = []
  const logger = Logger.make<unknown, void>(({ logLevel, message, fiber }) => {
    const first = Array.isArray(message) ? message[0] : message
    const values = fiber.getRef(References.CurrentLogAnnotations)
    logs.push([logLevel, first, ...Arr.map(annotations, (key) => values[key])])
  })
  return { logs, layer: Logger.layer([logger]) }
}
