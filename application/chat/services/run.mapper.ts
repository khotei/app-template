import { decodeOptionalWith, encodeRowWith } from '@app-template/packages/db'

import { Run } from '#chat/domain/run.model'
import { RunFields } from '#chat/domain/run-fields.model'

/** Encodes a Run's own fields as its row; the nested messages are read, never written. */
export const encodeRun = encodeRowWith(RunFields)

export const decodeRun = decodeOptionalWith(Run)
