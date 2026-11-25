import { assert, it } from '@effect/vitest'

import { RunState } from '#chat/domain/run-state'

it.each([
  { status: 'queued', active: true, started: false },
  { status: 'generating', active: true, started: true },
  { status: 'done', active: false, started: false },
  { status: 'failed', active: false, started: false },
] as const)(
  'a $status Run is active: $active, started: $started',
  ({ status, active, started }) => {
    assert.strictEqual(RunState.isActive({ status }), active)
    assert.strictEqual(RunState.isStarted({ status }), started)
  },
)
