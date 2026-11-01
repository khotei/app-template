import { DateTime } from 'effect'

/** The instant every `it.effect`'s `TestClock` starts at. */
export const epoch = DateTime.makeUnsafe(0)
